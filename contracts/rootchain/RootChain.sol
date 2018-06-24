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
    event Deposit(address depositor, uint256 amount);
    event FinalizedExit(uint priority, address owner, uint256 amount);
    event AddedToBalances(address owner, uint256 amount);

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
    struct exit {
        address owner;
        uint256 amount;
        uint256 created_at;
        uint256[3] utxoPos;
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
    }

    /// @dev txBytes Length 15 RLP encoding of Transaction excluding signatures
    /// Transaction encoding:
    /// [Blknum1, TxIndex1, Oindex1, Amount1, ConfirmSig1,
    ///  Blknum2, TxIndex2, Oindex2, Amount2, ConfirmSig2,
    ///  NewOwner, Denom1, NewOwner, Denom2, Fee]
    /// @notice owner and value should be encoded in Output 1
    /// @notice hash of txBytes is hashed with a empty signature
    function deposit(uint blocknum, bytes txBytes)
        public
        payable
    {
        require(currentDepositBlock < childBlockInterval, "blocknum cannot be a multiple of 1000");
        require(blocknum == currentChildBlock, "incorrect committed blocknum");

        RLPReader.RLPItem[] memory txList = txBytes.toRlpItem().toList();
        require(txList.length == 15, "incorrect tx list");
        for(uint256 i = 0; i < 10; i++) {
            require(txList[i].toUint() == 0, "incorrect tx fields");
        }
        require(txList[11].toUint() == msg.value, "mismatch in value");
        require(txList[13].toUint() == 0, "second output must be zero'd");

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
        emit Deposit(txList[10].toAddress(), msg.value);
    }


    /// @param txPos [0] Plasma block number in which the transaction occured
    /// @param txPos [1] Transaction Index within the block
    /// @param txPos [2] Output Index within the transaction (either 0 or 1)
    /// @param sigs First 130 bytes are signature of transaction and the rest is confirm signature
    /// @notice Each signature is 65 bytes
    function startExit(uint256[3] txPos, bytes txBytes, bytes proof, bytes sigs)
        public
        payable
        returns (uint256)
    {
        // txBytes verification
        RLPReader.RLPItem[] memory txList = txBytes.toRlpItem().toList();
        require(txList.length == 15, "incorrect tx length");
        require(msg.sender == txList[10 + 2 * txPos[2]].toAddress(), "address mismatch");
        require(msg.value == minExitBond, "incorrect exit bond");

        uint256 priority = 1000000000*txPos[0] + 10000*txPos[1] + txPos[2];

        // creating the correct merkle leaf
        bytes32 txHash = keccak256(txBytes);

        if (txPos[0] % childBlockInterval != 0) {
            require(txHash == childChain[txPos[0]].root, "block header mismatch");
        }
        else {
            bytes32 merkleHash = keccak256(abi.encodePacked(txHash, ByteUtils.slice(sigs, 0, 130)));
            require(txHash.checkSigs(childChain[txPos[0]].root, txList[0].toUint(), txList[5].toUint(), sigs), "validation error");
            require(merkleHash.checkMembership(txPos[1], childChain[txPos[0]].root, proof), "incorrect merkle proof");
        }

        // one-to-one mapping between priority and exit
        require(exits[priority].owner == address(0), "exit already exists");

        exitsQueue.insert(priority);

        exits[priority] = exit({
            owner: txList[10 + 2 * txPos[2]].toAddress(),
            amount: txList[11 + 2 * txPos[2]].toUint(),
            utxoPos: txPos,
            created_at: block.timestamp
        });
    }

    /// @param txPos [0] Plasma block number in which the challenger's transaction occured
    /// @param txPos [1] Transaction Index within the block
    /// @param txPos [2] Output Index within the transaction (either 0 or 1)
    /// @param newTxPos  Same as the above but the pos of the uxto created by the spend tx
    function challengeExit(uint256[3] txPos, uint256[3] newTxPos, bytes txBytes, bytes proof, bytes sigs, bytes confirmationSig)
        public
    {
        // txBytes verification
        RLPReader.RLPItem[] memory txList = txBytes.toRlpItem().toList();
        require(txList.length == 15, "incorrect tx list");

        // start-exit verification
        uint256 priority = 1000000000*txPos[0] + 10000*txPos[1] + txPos[2];
        uint256[3] memory utxoPos = exits[priority].utxoPos;
        require(utxoPos[0] == txList[0 + 5 * newTxPos[2]].toUint(), "incorrect blocknum");
        require(utxoPos[1] == txList[1 + 5 * newTxPos[2]].toUint(), "incorrect tx index");
        require(utxoPos[2] == txList[2 + 5 * newTxPos[2]].toUint(), "incorrect output index");

        /*
           Confirmation sig:
              txHash, sigs, block header
          */

        bytes32 txHash = keccak256(txBytes);
        bytes32 merkleHash = keccak256(abi.encodePacked(txHash, sigs));
        bytes32 root = childChain[newTxPos[0]].root;
        bytes32 confirmationHash = keccak256(abi.encodePacked(txHash, sigs, root));

        // challenge
        require(exits[priority].owner == confirmationHash.recover(confirmationSig), "mismatch in exit owner");
        require(merkleHash.checkMembership(newTxPos[1], root, proof), "incorrect merkle proof");

        // exit successfully challenged. Award the sender with the bond
        balances[msg.sender] = balances[msg.sender].add(minExitBond);
        totalWithdrawBalance = totalWithdrawBalance.add(minExitBond);
        emit AddedToBalances(msg.sender, minExitBond);

        delete exits[priority];
    }

    // @param numIter Number of exits to finalize (Each iteration costs < 70k gas)
    function finalizeExits(uint numIter)
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
        uint iter = 0;
        while (exitsQueue.currentSize() > 0 &&
               (block.timestamp.sub(currentExit.created_at)) > 1 weeks &&
               currentExit.amount.add(minExitBond) <= address(this).balance.sub(totalWithdrawBalance) &&
               iter < numIter) {

            iter = iter.add(1);

            // this can occur if challengeExit is sucessful on an exit
            if (currentExit.owner == address(0)) {
                exitsQueue.delMin();
            }
            else {
                amountToAdd = currentExit.amount.add(minExitBond);
                balances[currentExit.owner] = balances[currentExit.owner].add(amountToAdd);
                totalWithdrawBalance = totalWithdrawBalance.add(amountToAdd);
                emit AddedToBalances(currentExit.owner, amountToAdd);
                emit FinalizedExit(priority, currentExit.owner, amountToAdd);

                // move onto the next oldest exit
                exitsQueue.delMin();
                delete exits[priority];
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
        return address(this).balance.sub(totalWithdrawBalance);
    }

    function getBalance()
        public
        view
        returns (uint256)
    {
        return balances[msg.sender];
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
        returns (address, uint256, uint256[3], uint256)
    {
        return (exits[priority].owner, exits[priority].amount, exits[priority].utxoPos, exits[priority].created_at);
    }

    function getExitQueueSize()
        public
        view
        returns (uint256)
    {
        return exitsQueue.currentSize();
    }
}
