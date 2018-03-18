pragma solidity ^0.4.18;
import '../Libraries/SafeMath.sol';
import '../Libraries/Math.sol';
import '../Libraries/RLP.sol';
import '../Libraries/Merkle.sol';
import '../Libraries/Merkle.sol';
import '../Libraries/Validate.sol';
import '../DataStructures/PriorityQueue.sol';


contract RootChain {
    using SafeMath for uint256;
    using RLP for bytes;
    using RLP for RLP.RLPItem;
    using RLP for RLP.Iterator;
    using Merkle for bytes32;


    address public authority;

    /*
     *  Modifiers
     */
    modifier isAuthority() {
        require(msg.sender == authority);
        _;
    }

    /*
     * Events
     */
    event Deposit(address depositor, uint256 amount);

    /*
     *  Storage
     */
    mapping(uint256 => childBlock) public childChain;
    mapping(address => uint256) public failedWithdrawals;

    // startExit mechanism
    PriorityQueue exitsQueue;
    uint256 minExitBond;
    mapping(uint256 => exit) public exits;
    struct exit {
        address owner;
        uint256 amount;
        uint256 bond;
        uint256 created_at;
        uint256[3] utxoPos;
    }

    // child chain
    uint256 public currentChildBlock;
    uint256 public lastParentBlock;
    struct childBlock {
        bytes32 root;
        uint256 created_at;
    }

    // avoid recomputations
    bytes32[16] zeroHashes;


    function RootChain()
        public
    {
        authority = msg.sender;
        currentChildBlock = 1;
        lastParentBlock = block.number;

        exitsQueue = new PriorityQueue();

        // currently 5% of the the UTXO
        minExitBond = 5;

        bytes32 zeroBytes;
        for (uint256 i = 0; i < 16; i += 1) { // depth-16 merkle tree
            zeroHashes[i] = zeroBytes;
            zeroBytes = keccak256(zeroBytes, zeroBytes);
        }
    }
    /// @param root 32 byte merkleRoot of ChildChain block 
    /// @notice childChain blocks can only be submitted at most every 6 root chain blocks
    function submitBlock(bytes32 root)
        public
        isAuthority
    {
        // ensure finality on previous blocks before submitting another
        require(block.number >= lastParentBlock.add(6));
        childChain[currentChildBlock] = childBlock({
            root: root,
            created_at: block.timestamp
        });

        currentChildBlock = currentChildBlock.add(1);
        lastParentBlock = block.number;
    }

    /// @notice owner and value should be encoded in Output 1 
    /// @notice hash of txBytes is hashed with a empty signature 
    function deposit(bytes txBytes)
        public
        payable
    {
        // construction of the tx.
        // bytes32[11] txList;
        //txList[6] = msg.sender; txList[7] = msg.value;
        // bytes txBytes = RLP.encode(txList);
        var txList = txBytes.toRLPItem().toList();
        require(txList[6].toAddress() == msg.sender);
        require(txList[7].toUint() == msg.value);

        /*
            The signatures is kept seperate from the txBytes so that the signatures and
            confirm sign over the same hash
        */

        // construct the merkle root
        bytes32 root = keccak256(keccak256(txBytes), new bytes(130));
        for (uint256 i = 0; i < 16; i++) {
            root = keccak256(root, zeroHashes[i]);
        }

        childChain[currentChildBlock] = childBlock({
            root: root,
            created_at: block.timestamp
        });

        currentChildBlock = currentChildBlock.add(1);
        Deposit(msg.sender, msg.value);
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

    /// @param txPos [0] Plasma block number in which the transaction occured
    /// @param txPos [1] Transaction Index within the block
    /// @param txPos [2] Output Index within the transaction (either 0 or 1)
    /// @param sigs First 130 bytes are signature of transaction and the rest is confirm signature
    /// @notice Each signature is 65 bytes
    function startExit(uint256[3] txPos, bytes txBytes, bytes proof, bytes sigs)
        public
        payable
    {
        // txBytes verification
        var txList = txBytes.toRLPItem().toList();
        require(txList.length == 11);
        require(msg.sender == txList[6 + 2 * txPos[2]].toAddress());
        require(msg.value >= txList[7 + 2 * txPos[2]].toUint() * (minExitBond/100));


        // creating the correct merkle leaf
        bytes32 txHash = keccak256(txBytes);
        bytes32 merkleHash = keccak256(txHash, ByteUtils.slice(sigs, 0, 130));

        // will be fixed by collin's pr issue
        uint256 inputCount = txList[3].toUint() * 1000000 + txList[0].toUint();
        require(Validate.checkSigs(txHash, childChain[txPos[0]].root, inputCount, sigs));
        require(merkleHash.checkMembership(txPos[1], childChain[txPos[0]].root, proof));

        // one-to-one mapping between priority and exit
        uint256 priority = 1000000000*txPos[0] + 10000*txPos[1] + txPos[0];
        require(exits[priority].amount == 0);
        exitsQueue.insert(priority);

        exits[priority] = exit({
            owner: txList[6 + 2 * txPos[2]].toAddress(),
            amount: txList[7 + 2 * txPos[2]].toUint(),
            bond: msg.value,
            utxoPos: txPos,
            created_at: block.timestamp
        });
    }

    /// @param txPos [0] Plasma block number in which the challenger's transaction occured
    /// @param txPos [1] Transaction Index within the block
    /// @param txPos [2] Output Index within the transaction (either 0 or 1)
    function challengeExit(uint256[3] txPos, bytes txBytes, bytes proof, bytes sigs, bytes confirmationSig)
        public
        payable
    {
        // txBytes verification
        var txList = txBytes.toRLPItem().toList();
        require(txList.length == 11);

        // start-exit verification
        uint256 priority = 1000000000*txPos[0] + 10000*txPos[1] + txPos[0];
        uint256[3] memory utxoPos = exits[priority].utxoPos;
        require(utxoPos[0] == txList[0 + 2 * utxoPos[2]].toUint());
        require(utxoPos[1] == txList[1 + 2 * utxoPos[2]].toUint());
        require(utxoPos[2] == txList[2 + 2 * utxoPos[2]].toUint());

        /*
           Confirmation sig includes:
              txHash, sigs, block header
          */
        
        var txHash = keccak256(txBytes);
        var merkleHash = keccak256(txHash, sigs);
        var confirmationHash = keccak256(txHash, sigs, childChain[txPos[0]].root);

        require(exits[priority].owner == ECRecovery.recover(confirmationHash, confirmationSig));
        require(merkleHash.checkMembership(txPos[1], childChain[txPos[0]].root, proof));

        msg.sender.transfer(exits[priority].bond);
        delete exits[priority];
    }

    function finalizeExits()
        public
    {
        // retrieve the lowest priority and the appropriate exit struct
        uint256 priority = exitsQueue.getMin();
        exit memory currentExit = exits[priority];

        while (exitsQueue.currentSize() > 0 && (block.timestamp - currentExit.created_at) > 1 weeks) {

            // prevent a potential DoS attack if from someone purposely reverting a payment
            if(!currentExit.owner.send(currentExit.amount + currentExit.bond)) {
                failedWithdrawals[currentExit.owner] = currentExit.amount + currentExit.bond;
            }

            // delete the finalized exit
            priority = exitsQueue.delMin();
            delete exits[priority];

            // move onto the next oldest exit
            priority = exitsQueue.getMin();
            currentExit = exits[priority];
        }
    }

    function withdraw() 
        public
    {
        uint256 amt = failedWithdrawals[msg.sender];
        require(amt > 0);

        if(msg.sender.send(amt)) {
            delete failedWithdrawals[msg.sender];
        }
    }

}
