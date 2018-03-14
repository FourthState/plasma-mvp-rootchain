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

    //TODO: Refactor submit block to have block number included. Aggregate signatures for start exit. Create Withdraw method.
    //TODO: Create reward system to incentivize fraud proofs
    //TODO: Possibly useful to rely on OpenZeppelin instead of current Library contracts.
    //TODO: Slash malicious block proposer. Not useful in PoA.

    /*
     * Events
     */
    event Deposit(address depositor, uint256 amount);

    /*
     *  Storage
     */
    mapping(uint256 => childBlock) public childChain;
    mapping(uint256 => exit) public exits;
    mapping(uint256 => uint256) public exitIds;
    PriorityQueue exitsQueue;
    address public authority;
    uint256 public currentChildBlock;
    uint256 public lastParentBlock;
    uint256 public recentBlock;
    uint256 public weekOldBlock;
    uint256 minExitBond; //this is a percentage out of 100 that user must stake to exit.

    bytes32[16] zeroHashes;

    struct exit {
        address owner;
        uint256 amount;
        uint256 bond;
        uint256[3] utxoPos;
    }

    struct childBlock {
        bytes32 root;
        uint256 created_at;
    }

    /*
     *  Modifiers
     */
    modifier isAuthority() {
        require(msg.sender == authority);
        _;
    }

    modifier incrementOldBlocks() {
        while (childChain[weekOldBlock].created_at < block.timestamp.sub(1 weeks)) {
            if (childChain[weekOldBlock].created_at == 0) 
                break;
            weekOldBlock = weekOldBlock.add(1);
        }
        _;
    }

    function RootChain()
        public
    {
        authority = msg.sender;
        currentChildBlock = 1;
        lastParentBlock = block.number;
        exitsQueue = new PriorityQueue();
        minExitBond = 5; // 5% of UTXO
        bytes32 intermediate;
        for (uint256 i = 0; i < 16; i += 1) {
            zeroHashes[i] = intermediate;
            intermediate = keccak256(intermediate, intermediate);
        }
    }
    /// @param root 32 byte merkleRoot of ChildChain block 
    /// @notice childChain blocks can only be submitted at most every 6 root chain blocks
    function submitBlock(bytes32 root)
        public
        isAuthority
        incrementOldBlocks
    {
        require(block.number >= lastParentBlock.add(6));
        childChain[currentChildBlock] = childBlock({
            root: root,
            created_at: block.timestamp
        });
        currentChildBlock = currentChildBlock.add(1);
        lastParentBlock = block.number;
    }

    /// @dev txBytes Length 11 RLP encoding of Transaction excluding signatures
    /// @notice owner and value should be encoded in Output 1 
    /// @notice hash of txBytes is hashed with a empty signature 
    function deposit(bytes txBytes)
        public
        payable
    {
        var txList = txBytes.toRLPItem().toList();
        require(txList.length == 11);
        for (uint256 i; i < 6; i++) {
            require(txList[i].toUint() == 0);
        }
        require(txList[7].toUint() == msg.value);
        require(txList[9].toUint() == 0);
        bytes32 root = keccak256(keccak256(txBytes), new bytes(130));
        for (i = 0; i < 16; i++) {
            root = keccak256(root, zeroHashes[i]);
        }
        childChain[currentChildBlock] = childBlock({
            root: root,
            created_at: block.timestamp
        });
        currentChildBlock = currentChildBlock.add(1);
        Deposit(txList[6].toAddress(), txList[7].toUint());
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
        returns (address, uint256, uint256[3])
    {
        return (exits[priority].owner, exits[priority].amount, exits[priority].utxoPos);
    }

    /// @param txPos [0] Plasma block number in which the transaction occured
    /// @param txPos [1] Transaction Index within the block
    /// @param txPos [2] Output Index within the transaction (either 0 or 1)
    /// @param sigs First 130 bytes are signature of transaction and the rest is confirm signature
    /// @notice Each signature is 65 bytes
    function startExit(uint256[3] txPos, bytes txBytes, bytes proof, bytes sigs)
        public
        payable
        incrementOldBlocks
    {
        var txList = txBytes.toRLPItem().toList();
        require(txList.length == 11);
        require(msg.sender == txList[6 + 2 * txPos[2]].toAddress());
        require(msg.value >= txList[7 + 2 * txPos[2]].toUint() * minExitBond / 100);
        bytes32 txHash = keccak256(txBytes);
        bytes32 merkleHash = keccak256(txHash, ByteUtils.slice(sigs, 0, 130));
        uint256 inputCount = txList[3].toUint() * 1000000 + txList[0].toUint();
        require(Validate.checkSigs(txHash, childChain[txPos[0]].root, inputCount, sigs));
        require(merkleHash.checkMembership(txPos[1], childChain[txPos[0]].root, proof));
        uint256 priority = 1000000000 + txPos[1] * 10000 + txPos[2];
        uint256 exitId = txPos[0].mul(priority);
        priority = priority.mul(Math.max(txPos[0], weekOldBlock));
        require(exitIds[exitId] == 0);
        require(exits[priority].amount == 0);
        exitIds[exitId] = priority;
        exitsQueue.insert(priority);
        exits[priority] = exit({
            owner: txList[6 + 2 * txPos[2]].toAddress(),
            amount: txList[7 + 2 * txPos[2]].toUint(),
            bond: msg.value,
            utxoPos: txPos
        });
    }

    /// @param txPos [0] Plasma block number in which the challenger's transaction occured
    /// @param txPos [1] Transaction Index within the block
    /// @param txPos [2] Output Index within the transaction (either 0 or 1)
    function challengeExit(uint256 exitId, uint256[3] txPos, bytes txBytes, bytes proof, bytes sigs, bytes confirmationSig)
        public
        payable
    {
        var txList = txBytes.toRLPItem().toList();
        require(txList.length == 11);
        uint256 priority = exitIds[exitId];
        uint256[3] memory exitsUtxoPos = exits[priority].utxoPos;
        require(exitsUtxoPos[0] == txList[0 + 2 * exitsUtxoPos[2]].toUint());
        require(exitsUtxoPos[1] == txList[1 + 2 * exitsUtxoPos[2]].toUint());
        require(exitsUtxoPos[2] == txList[2 + 2 * exitsUtxoPos[2]].toUint());
        var txHash = keccak256(txBytes);
        var confirmationHash = keccak256(txHash, sigs, childChain[txPos[0]].root);
        var merkleHash = keccak256(txHash, sigs);
        address owner = exits[priority].owner;
        require(owner == ECRecovery.recover(confirmationHash, confirmationSig));
        require(merkleHash.checkMembership(txPos[1], childChain[txPos[0]].root, proof));
        msg.sender.transfer(exits[priority].bond);
        delete exits[priority];
        delete exitIds[exitId];
    }

    function finalizeExits()
        public
        incrementOldBlocks
        returns (uint256)
    {
        uint256 twoWeekOldTimestamp = block.timestamp.sub(2 weeks);
        exit memory currentExit = exits[exitsQueue.getMin()];
        while (childChain[currentExit.utxoPos[0]].created_at < twoWeekOldTimestamp && exitsQueue.currentSize() > 0) {
            // return childChain[currentExit.utxoPos[0]].created_at;
            uint256 exitId = currentExit.utxoPos[0] * 1000000000 + currentExit.utxoPos[1] * 10000 + currentExit.utxoPos[2];
            currentExit.owner.transfer(currentExit.amount + currentExit.bond);
            uint256 priority = exitsQueue.delMin();
            delete exits[priority];
            delete exitIds[exitId];
            currentExit = exits[exitsQueue.getMin()];
        }
    }

}
