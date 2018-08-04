pragma solidity ^0.4.24;

// external modules
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "solidity-rlp/contracts/RLPReader.sol";

import "../libraries/Validator.sol";
import "../libraries/PriorityQueue.sol";

contract RootChain is Ownable {
    using SafeMath for uint256;
    using Validator for bytes32;
    using RLPReader for bytes;
    using RLPReader for RLPReader.RLPItem;

    /*
     * Events
     */
    event AddedToBalances(address owner, uint256 amount);
    event BlockSubmitted(bytes32 root, uint256 position);
    event ChallengedExit(uint priority, address owner, uint256 amount, uint256[3] utxoPos);
    event Deposit(address depositor, uint256 amount);
    event FinalizedExit(uint priority, address owner, uint256 amount);

    /*
     *  Storage
     */
    mapping(uint256 => childBlock) public childChain;
    mapping(address => uint256) public balances;

    uint256 public totalWithdrawBalance;

    // startExit mechanism
    PriorityQueue exitsQueue;
    uint256 minExitBond;
    mapping(uint256 => exit) public exits;

    // exit.state flags: 0 -> does not exist; 1 -> started/pending; 2 -> challenged; 3 -> finalized
    struct exit {
        uint256 amount;
        uint256 created_at;
        uint256[3] utxoPos;
        address owner;
        uint8 state;
    }

    // child chain
    uint256 public childBlockInterval;
    uint256 public currentChildBlock;
    uint256 public currentDepositBlock;
    uint256 public lastParentBlock;
    struct childBlock {
        bytes32 root;
        uint256 created_at;
    }

    constructor() public
    {
        exitsQueue = new PriorityQueue();
        require(exitsQueue.owner() == address(this), "incorrect PriorityQueue owner");

        childBlockInterval = 1000;
        currentChildBlock = childBlockInterval;
        currentDepositBlock = 1;
        lastParentBlock = block.number;

        minExitBond = 10000; // minimum bond needed to exit.
    }

    /// @param root 32 byte merkleRoot of ChildChain block
    /// @notice childChain blocks can only be submitted at most every 6 root chain blocks
    function submitBlock(bytes32 root)
        public
        onlyOwner
    {
        // ensure finality on previous blocks before submitting another
        require(block.number >= lastParentBlock.add(6), "presumed finality required");
        childChain[currentChildBlock] = childBlock({
            root: root,
            created_at: block.timestamp
        });

        currentChildBlock = currentChildBlock.add(childBlockInterval);
        currentDepositBlock = 1;
        lastParentBlock = block.number;

        emit BlockSubmitted(root, currentChildBlock);
    }

    /// @dev txBytes Length 13 RLP encoding of Transaction excluding signatures
    /// Transaction encoding:
    /// [Blknum1, TxIndex1, Oindex1, Amount1,
    ///  Blknum2, TxIndex2, Oindex2, Amount2,
    ///  NewOwner, Denom1, NewOwner, Denom2, Fee]
    /// @notice owner and value should be encoded in Output 1
    /// @notice hash of txBytes is hashed with a empty signature
    function deposit(uint blocknum, bytes txBytes)
        public
        payable
    {
        require(currentDepositBlock < childBlockInterval, "deposit blocknum cannot be a multiple of 1000");
        require(blocknum == currentChildBlock, "incorrect committed blocknum");

        RLPReader.RLPItem[] memory txList = txBytes.toRlpItem().toList();
        require(txList.length == 13, "incorrect tx list");
        for(uint i = 0; i < 8; i++) {
            require(txList[i].toUint() == 0, "incorrect tx fields");
        }
        require(txList[9].toUint() == msg.value, "mismatch in value");
        require(txList[11].toUint() == 0, "second output must be zero'd");

        /*
            The signatures are kept seperate from the txBytes to avoid having to
            recreate the txBytes for the confirmsig after both signatures are created.
        */

        // construct the merkle root
        bytes32 root = keccak256(txBytes);
        uint256 position = getDepositBlock();

        childChain[position] = childBlock({
            root: root,
            created_at: block.timestamp
        });

        currentDepositBlock = currentDepositBlock.add(1);
        emit Deposit(txList[8].toAddress(), msg.value);
    }

    /// @param txPos [0] Plasma block number in which the transaction occured
    /// @param txPos [1] Transaction Index within the block
    /// @param txPos [2] Output Index within the transaction (either 0 or 1)
    /// @param sigs First 130 bytes are signature of transaction
    /// @notice Each signature is 65 bytes
    function startExit(uint256[3] txPos, bytes txBytes, bytes proof, bytes sigs)
        public
        payable
        returns (uint256)
    {
        // txBytes verification
        RLPReader.RLPItem[] memory txList = txBytes.toRlpItem().toList();
        require(txList.length == 13, "incorrect tx length");
        require(msg.sender == txList[8 + 2 * txPos[2]].toAddress(), "address mismatch");
        require(msg.value == minExitBond, "incorrect exit bond");

        uint256 priority = 1000000000 * txPos[0] + 10000 * txPos[1] + txPos[2];

        // check that the UTXO has not been previously exited
        require(exits[priority].state == 0);

        // creating the correct merkle leaf
        bytes32 txHash = keccak256(txBytes);
        if (txPos[0] % childBlockInterval != 0) {
            require(txHash == childChain[txPos[0]].root, "block header mismatch");
        } else {
            bytes32 merkleHash = keccak256(abi.encodePacked(txHash, ByteUtils.slice(sigs, 0, 130)));
            require(merkleHash.checkMembership(txPos[1], childChain[txPos[0]].root, proof), "incorrect merkle proof");
        }

        // check that the UTXO's two direct inputs have not been previously exited
        validateExitInputs(txList);

        // create new started/pending exit after passing all previous checks
        exitsQueue.insert(priority);
        exits[priority] = exit({
            owner: txList[8 + 2 * txPos[2]].toAddress(),
            amount: txList[9 + 2 * txPos[2]].toUint(),
            utxoPos: txPos,
            created_at: block.timestamp,
            state: 1
        });
    }

    /// For any attempted exit of an UTXO, validate that the UTXO's two inputs have not
    /// been previously exited. If UTXO's inputs are in the exit queue, those inputs'
    /// exits are deleted from the exit queue and the current UTXO's exit remains valid.
    function validateExitInputs(RLPReader.RLPItem[] memory txList)
        private
        view
    {
        for (uint256 i = 0; i < 2; i++) {
            uint256 txInputBlkNum = txList[4*i + 0].toUint();
            uint256 txInputIndex = txList[4*i + 1].toUint();
            uint256 txInputOutIndex = txList[4*i + 2].toUint();
            uint256 txInputPriority = 1000000000*txInputBlkNum + 10000*txInputIndex + txInputOutIndex;

            // this UTXO's inputs must have been challenged or not exited
            uint state = exits[txInputPriority].state;
            require(state == 0 || state == 2, "inputs are being exited or finalized");
        }
    }

    /// @param txPos [0] Plasma block number in which the challenger's transaction occured
    /// @param txPos [1] Transaction Index within the block
    /// @param txPos [2] Output Index within the transaction (either 0 or 1)
    /// @param newTxPos  Same as the above but the pos of the uxto created by the spend tx
    function challengeExit(uint256[3] txPos, uint256[3] newTxPos, bytes txBytes, bytes proof, bytes sigs)
        public
    {
        // txBytes verification
        RLPReader.RLPItem[] memory txList = txBytes.toRlpItem().toList();
        require(txList.length == 13, "incorrect tx list");

        // start-exit verification
        uint256 priority = 1000000000 * txPos[0] + 10000 * txPos[1] + txPos[2];
        // check that the exit being challenged is a pending exit
        require(exits[priority].state == 1);

        uint256[3] memory utxoPos = exits[priority].utxoPos;
        require(utxoPos[0] == txList[0 + 4 * newTxPos[2]].toUint(), "incorrect blocknum");
        require(utxoPos[1] == txList[1 + 4 * newTxPos[2]].toUint(), "incorrect tx index");
        require(utxoPos[2] == txList[2 + 4 * newTxPos[2]].toUint(), "incorrect output index");

        // challenge
        bytes32 root = childChain[newTxPos[0]].root;
        bytes32 merkleHash = keccak256(abi.encodePacked(keccak256(txBytes), sigs));
        require(merkleHash.checkMembership(newTxPos[1], root, proof), "incorrect merkle proof");

        // exit successfully challenged. Award the sender with the bond
        balances[msg.sender] = balances[msg.sender].add(minExitBond);
        totalWithdrawBalance = totalWithdrawBalance.add(minExitBond);
        emit AddedToBalances(msg.sender, minExitBond);

        // change the Exit's state to 'challenged'
        exits[priority].state = 2;
        emit ChallengedExit(priority, exits[priority].owner, exits[priority].amount, exits[priority].utxoPos);
    }

    function finalizeExits()
        public
    {
        // getMin will fail if nothing is in the queue
        if (exitsQueue.currentSize() == 0) {
            return;
        }

        // retrieve the lowest priority and the appropriate exit struct
        uint256 priority = exitsQueue.getMin();
        exit memory currentExit = exits[priority];

        /*
        * Conditions:
        *   1. Exits exist
        *   2. Exits must be a week old
        *   3. Funds must exists for the exit to withdraw
        */
        uint256 amountToAdd;
        while (exitsQueue.currentSize() > 0 &&
               (block.timestamp - currentExit.created_at) > 1 weeks &&
               currentExit.amount.add(minExitBond) <= address(this).balance - totalWithdrawBalance) {

            // skip currentExit if it is not in 'started/pending' state.
            if (currentExit.state != 1) {
                exitsQueue.delMin();
            } else {
                amountToAdd = currentExit.amount.add(minExitBond);
                balances[currentExit.owner] = balances[currentExit.owner].add(amountToAdd);
                totalWithdrawBalance = totalWithdrawBalance.add(amountToAdd);

                exits[priority].state = 3;

                emit AddedToBalances(currentExit.owner, amountToAdd);
                emit FinalizedExit(priority, currentExit.owner, amountToAdd);

                // move onto the next oldest exit
                exitsQueue.delMin();
            }

            if (exitsQueue.currentSize() == 0) {
                return;
            }

            // move onto the next oldest exit
            priority = exitsQueue.getMin();
            currentExit = exits[priority];
        }
    }

    function withdraw()
        public
        returns (uint256)
    {
        if (balances[msg.sender] == 0) {
            return 0;
        }

        uint256 transferAmount = balances[msg.sender];
        delete balances[msg.sender];
        totalWithdrawBalance = totalWithdrawBalance.sub(transferAmount);

        // will revert the above deletion if fails
        msg.sender.transfer(transferAmount);
        return transferAmount;
    }

    /*
    * Getters
    */

    function childChainBalance()
        public
        view
        returns (uint)
    {
        // takes into accounts the failed withdrawals
        return address(this).balance - totalWithdrawBalance;
    }

    function balanceOf(address _address)
        public
        view
        returns (uint256)
    {
        return balances[_address];
    }

    function getDepositBlock()
        public
        view
        returns (uint256)
    {
        return currentChildBlock.sub(childBlockInterval).add(currentDepositBlock);
    }

    function getChildChain(uint256 blockNumber)
        public
        view
        returns (bytes32, uint256)
    {
        return (childChain[blockNumber].root, childChain[blockNumber].created_at);
    }

    function getExit(uint256 priority)
        public
        view
        returns (address, uint256, uint256[3], uint256, uint8)
    {
        return (exits[priority].owner, exits[priority].amount, exits[priority].utxoPos, exits[priority].created_at, exits[priority].state);
    }
}
