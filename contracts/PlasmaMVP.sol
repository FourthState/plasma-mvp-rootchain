pragma solidity ^0.5.0;

// external modules
import "solidity-rlp/contracts/RLPReader.sol";

// libraries
import "./libraries/SafeMath.sol";
import "./libraries/ECDSA.sol";
import "./libraries/TMSimpleMerkleTree.sol";
import "./libraries/MinPriorityQueue.sol";

contract PlasmaMVP {
    using MinPriorityQueue for uint256[];
    using RLPReader for bytes;
    using RLPReader for RLPReader.RLPItem;
    using SafeMath for uint256;
    using TMSimpleMerkleTree for bytes32;
    using ECDSA for bytes32;

    /*
     * Events
     */

    event AddedToBalances(address owner, uint256 amount);
    event BlockSubmitted(bytes32 root, uint256 blockNumber, uint256 numTxns, uint256 feeAmount);
    event Deposit(address depositor, uint256 amount, uint256 depositNonce, uint256 ethBlockNum);

    event StartedTransactionExit(uint256[3] position, address owner, uint256 amount,
                                 bytes confirmSignature0, bytes confirmSignature1, uint256 committedFee);
    event StartedDepositExit(uint256 nonce, address owner, uint256 amount, uint256 committedFee);

    event ChallengedExit(uint256[4] position, address owner, uint256 amount);
    event FinalizedExit(uint256[4] position, address owner, uint256 amount);

    /*
     *  Storage
     */

    address operator;

    // child chain
    uint256 public lastCommittedBlock;
    uint256 public depositNonce;
    mapping(uint256 => childBlock) public childChain;
    mapping(uint256 => depositStruct) public deposits;
    struct childBlock {
        bytes32 root;
        uint256 numTxns;
        uint256 feeAmount;
        uint256 createdAt;
    }
    struct depositStruct {
        address owner;
        uint256 amount;
        uint256 createdAt;
        uint256 ethBlockNum;
    }

    // exits
    uint256 public minExitBond;
    uint256[] public txExitQueue;
    uint256[] public depositExitQueue;
    mapping(uint256 => exit) public txExits;
    mapping(uint256 => exit) public depositExits;
    enum ExitState { NonExistent, Pending, Challenged, Finalized }
    struct exit {
        uint256 amount;
        uint256 committedFee;
        uint256 createdAt;
        address owner;
        uint256[4] position; // (blkNum, txIndex, outputIndex, depositNonce)
        ExitState state; // default value is `NonExistent`
    }

    // funds
    mapping(address => uint256) public balances;
    uint256 public totalWithdrawBalance;

    // constants
    uint256 public constant txIndexFactor = 10;
    uint256 public constant blockIndexFactor = 1000000;
    uint256 public constant maxTxnsPerBLock = 2**16 - 1;

    /** Modifiers **/
    modifier isBonded()
    {
        require(msg.value >= minExitBond, "insufficient bond committed");
        if (msg.value > minExitBond) {
            uint256 excess = msg.value.sub(minExitBond);
            balances[msg.sender] = balances[msg.sender].add(excess);
            totalWithdrawBalance = totalWithdrawBalance.add(excess);
        }

        _;
    }

    modifier onlyOperator()
    {
        require(msg.sender == operator, "unauthorized");
        _;
    }

    constructor() public
    {
        operator = msg.sender;

        lastCommittedBlock = 0;
        depositNonce = 1;
        minExitBond = 10000;
    }

    // @param blocks       32 byte merkle roots appended in ascending order
    // @param txnsPerBlock number of transactions per block
    // @param feesPerBlock amount of fees the validator has collected per block
    // @param blockNum     the block number of the first header
    function submitBlock(bytes32[] memory headers, uint256[] memory txnsPerBlock, uint256[] memory feesPerBlock, uint256 blockNum)
        public
        onlyOperator
    {
        require(blockNum == lastCommittedBlock + 1, "inconsistent block number ordering");
        require(headers.length == txnsPerBlock.length && headers.length == feesPerBlock.length, "mismatch in the number of headers, txn numbers, and fees");

        for (uint i = 0; i < headers.length; i++) {
            require(txnsPerBlock[i] <= maxTxnsPerBLock, "number of transactions in block exceeds limit");

            childChain[blockNum + i] = childBlock(headers[i], txnsPerBlock[i], feesPerBlock[i], block.timestamp);
            emit BlockSubmitted(headers[i], blockNum + i, txnsPerBlock[i], feesPerBlock[i]);
        }

        lastCommittedBlock = lastCommittedBlock.add(uint256(headers.length));
   }

    // @param owner owner of this deposit
    function deposit(address owner)
        public
        payable
    {
        deposits[depositNonce] = depositStruct(owner, msg.value, block.timestamp, block.number);
        emit Deposit(owner, msg.value, depositNonce, block.number);

        depositNonce = depositNonce.add(uint256(1));
    }

    // @param depositNonce the nonce of the specific deposit
    function startDepositExit(uint256 nonce, uint256 committedFee)
        public
        payable
        isBonded
    {
        require(deposits[nonce].owner == msg.sender, "mismatch in owner");
        require(deposits[nonce].amount > committedFee, "committedFee out of bounds of the deposit amount");
        require(depositExits[nonce].state == ExitState.NonExistent, "exit for this deposit already exists");

        address owner = deposits[nonce].owner;
        uint256 amount = deposits[nonce].amount;
        uint256 priority = block.timestamp << 128 | nonce;
        depositExitQueue.insert(priority);
        depositExits[nonce] = exit({
            owner: owner,
            amount: amount,
            committedFee: committedFee,
            createdAt: block.timestamp,
            position: [0,0,0,nonce],
            state: ExitState.Pending
        });

        emit StartedDepositExit(nonce, owner, amount, committedFee);
    }

    // Transaction encoding:
    // [[Blknum1, TxIndex1, Oindex1, DepositNonce1, Input1ConfirmSig,
    //   Blknum2, TxIndex2, Oindex2, DepositNonce2, Input2ConfirmSig,
    //   NewOwner, Denom1, NewOwner, Denom2, Fee],
    //  [Signature1, Signature2]]
    //
    // @param txBytes rlp encoded transaction
    // @notice this function will revert if the txBytes are malformed
    function decodeTransaction(bytes memory txBytes)
        internal
        pure
        returns (RLPReader.RLPItem[] memory txList, RLPReader.RLPItem[] memory sigList, bytes32 txHash)
    {
        RLPReader.RLPItem[] memory spendMsg = txBytes.toRlpItem().toList();
        require(spendMsg.length == 2, "incorrect encoding of the transcation");

        txList = spendMsg[0].toList();
        require(txList.length == 15, "incorrect number of items in the transaction list");

        sigList = spendMsg[1].toList();
        require(sigList.length == 2, "two signatures must be present");

        // bytes the signatures are over
        txHash = keccak256(spendMsg[0].toRlpBytes());
    }

    // @param txPos             location of the transaction [blkNum, txIndex, outputIndex]
    // @param txBytes           raw transaction bytes
    // @param proof             merkle proof of inclusion in the child chain
    // @param confSig0          confirm signatures sent by the owners of the first input acknowledging the spend.
    // @param confSig1          confirm signatures sent by the owners of the second input acknowledging the spend (if applicable).
    // @notice `confirmSignatures` and `ConfirmSig0`/`ConfirmSig1` are unrelated to each other.
    // @notice `confirmSignatures` is either 65 or 130 bytes in length dependent on if input2 is used.
    function startTransactionExit(uint256[3] memory txPos, bytes memory txBytes, bytes memory proof,
                                  bytes memory confSig0, bytes memory confSig1, uint256 committedFee)
        public
        payable
        isBonded
    {
        uint256 position = blockIndexFactor*txPos[0] + txIndexFactor*txPos[1] + txPos[2];
        require(txExits[position].state == ExitState.NonExistent, "this exit has already been started, challenged, or finalized");

        uint256 amount = startTransactionExitHelper(txPos, txBytes, proof, confSig0, confSig1);
        require(amount > committedFee, "committedFee out of bounds of the transaction amount");

        // calculate the priority of the transaction taking into account the withdrawal delay attack
        // withdrawal delay attack: https://github.com/FourthState/plasma-mvp-rootchain/issues/42
        uint256 createdAt = childChain[txPos[0]].createdAt;
        txExitQueue.insert(SafeMath.max(createdAt + 1 weeks, block.timestamp) << 128 | position);

        // write exit to storage
        txExits[position] = exit({
            owner: msg.sender,
            amount: amount,
            committedFee: committedFee,
            createdAt: block.timestamp,
            position: [txPos[0], txPos[1], txPos[2], 0],
            state: ExitState.Pending
        });

        emit StartedTransactionExit(txPos, msg.sender, amount, confSig0, confSig1, committedFee);
    }

    // @returns amount of the exiting transaction
    // @notice the purpose of this helper was to work around the capped evm stack frame
    function startTransactionExitHelper(uint256[3] memory txPos, bytes memory txBytes, bytes memory proof,
                                        bytes memory confSig0, bytes memory confSig1)
        private
        view
        returns (uint256)
    {
        bytes32 txHash;
        RLPReader.RLPItem[] memory txList;
        RLPReader.RLPItem[] memory sigList;
        (txList, sigList, txHash) = decodeTransaction(txBytes);

        require(msg.sender == txList[10 + 2*txPos[2]].toAddress(), "mismatch in utxo owner");

        childBlock memory plasmaBlock = childChain[txPos[0]];

        // check signatures
        bytes32 merkleHash = sha256(txBytes);
        bytes32 confirmationHash = sha256(abi.encodePacked(merkleHash, plasmaBlock.root));
        bytes memory sig = sigList[0].toBytes();
        require(sig.length == 65 && confSig0.length == 65, "first input's signatures must be 65 bytes in length");
        require(txHash.recover(sig) == confirmationHash.recover(confSig0), "signature mismatch in the first input");
        // a deposit input does not have confirm signatures so we only check for the existence of a transactional input
        if (txList[5].toUint() > 0) {
            sig = sigList[1].toBytes();
            require(sig.length == 65 && confSig1.length == 65, "second input's signatures must be 65 bytes in length");
            require(txHash.recover(sig) == confirmationHash.recover(confSig1), "signature mismatch in the second input");
        }

        // check proof
        require(merkleHash.checkMembership(txPos[1], plasmaBlock.root, proof, plasmaBlock.numTxns), "invalid merkle proof");

        // check that the UTXO's two direct inputs have not been previously exited
        require(validateTransactionExitInputs(txList), "an input is pending an exit or has been finalized");

        return txList[11 + 2*txPos[2]].toUint();
    }

    // For any attempted exit of an UTXO, validate that the UTXO's two inputs have not
    // been previously exited or are currently pending an exit.
    function validateTransactionExitInputs(RLPReader.RLPItem[] memory txList)
        private
        view
        returns (bool)
    {
        for (uint256 i = 0; i < 2; i++) {
            ExitState state;
            uint depositNonce_ = txList[5*i + 3].toUint();
            if (depositNonce_ == 0) {
                uint256 blkNum = txList[5*i + 0].toUint();
                uint256 inputIndex = txList[5*i + 1].toUint();
                uint256 outputIndex = txList[5*i + 2].toUint();
                uint256 position = blockIndexFactor*blkNum + txIndexFactor*inputIndex + outputIndex;
                state = txExits[position].state;
            } else
                state = depositExits[depositNonce_].state;

            if (state != ExitState.NonExistent && state != ExitState.Challenged)
                return false;
        }

        return true;
    }

    // Validator of any block can call this function to exit the fees collected
    // for that particular block. The fee exit is added to exit queue with the lowest priority for that block.
    // In case of the fee UTXO already spent, anyone can challenge the fee exit by providing
    // the spend of the fee UTXO.
    // @param blockNumber the block for which the validator wants to exit fees
    function startFeeExit(uint256 blockNumber)
        public
        payable
        onlyOperator
        isBonded
    {
        // specified blockNumber must exist in child chain
        require(childChain[blockNumber].root != bytes32(0), "specified block does not exist in child chain.");

        // a fee UTXO has explicitly defined position [blockNumber, 2**16 - 1, 0]
        uint256 txIndex = 2**16 - 1;
        uint256 position = blockIndexFactor*blockNumber + txIndexFactor*txIndex;
        require(txExits[position].state == ExitState.NonExistent, "this exit has already been started, challenged, or finalized");

        txExitQueue.insert(SafeMath.max(childChain[blockNumber].createdAt + 1 weeks, block.timestamp) << 128 | position);

        uint256 feeAmount = childChain[blockNumber].feeAmount;
        txExits[position] = exit({
            owner: msg.sender,
            amount: feeAmount,
            committedFee: 0,
            createdAt: block.timestamp,
            position: [blockNumber, txIndex, 0, 0],
            state: ExitState.Pending
        });

        // pass in empty bytes for confirmSignatures for StartedTransactionExit event.
        emit StartedTransactionExit([blockNumber, txIndex, 0], msg.sender, feeAmount, "", "", 0);
    }

    // @param exitedTxPos transaction position. Full position - [blkNum, txIndex, outputIndex, depositNonce]
    // @param challengingTxPos transaction position [blkNum, txIndex]
    // @param txBytes raw bytes of the transaction
    // @param proof merkle proof of the included transaction
    // @notice The exiting transaction bytes are needed to ensure the exiting output is the signer of the challenging transaction
    function challengeFeeMismatch(uint256[4] memory exitingTxPos, uint256[2] memory challengingTxPos, bytes memory txBytes, bytes memory proof)
        public
    {
        bytes32 txHash;
        RLPReader.RLPItem[] memory txList;
        RLPReader.RLPItem[] memory sigList;
        (txList, sigList, txHash) = decodeTransaction(txBytes);

        // exitingTxPos must be the first input of the challenging transaction
        require(exitingTxPos[0] == txList[0].toUint() && exitingTxPos[1] == txList[1].toUint()
                && exitingTxPos[2] == txList[2].toUint() && exitingTxPos[3] == txList[3].toUint(),
                "exiting transcation must be the first input of the challenging transaction");

        // merkle proofs for both transactions
        childBlock memory plasmaBlock = childChain[challengingTxPos[0]];
        require(sha256(txBytes).checkMembership(challengingTxPos[1], plasmaBlock.root, proof, plasmaBlock.numTxns),
                "incorrect merkle proof for the challenging transaction");

        exit storage exit_ = exitingTxPos[3] == 0 ? 
            txExits[blockIndexFactor*exitingTxPos[0] + txIndexFactor*exitingTxPos[1] + exitingTxPos[2]] : depositExits[exitingTxPos[3]];
        require(exit_.state == ExitState.Pending, "an exit must be pending");

        // check the first input's signature.
        // this prevent's the operator from forging a transaction to challenge any valid exit.
        require(exit_.owner == txHash.recover(sigList[0].toBytes()), "incorrect first signature");

        uint256 feeAmount = txList[14].toUint();
        require(exit_.committedFee != feeAmount, "no mismatch in committed fee");

        // award the challenger the bond
        balances[msg.sender] = balances[msg.sender].add(minExitBond);
        totalWithdrawBalance = totalWithdrawBalance.add(minExitBond);

        // mark the exit as NonExistent. Can be reopened
        exit_.state = ExitState.NonExistent;
        emit ChallengedExit(exitingTxPos, exit_.owner, exit_.amount - exit_.committedFee);
    }

    // @param exitingTxPos     position of the invalid exiting transaction [blkNum, txIndex, outputIndex]
    // @param challengingTxPos position of the challenging transaction [blkNum, txIndex]
    // @param txBytes          raw transaction bytes of the challenging transaction
    // @param proof            proof of inclusion for this merkle hash
    // @param confirmSignature signature used to invalidate the invalid exit. Signature is over (merkleHash, block header)
    function challengeExit(uint256[4] memory exitingTxPos, uint256[2] memory challengingTxPos, bytes memory txBytes, bytes memory proof, bytes memory confirmSignature)
        public
    {
        RLPReader.RLPItem[] memory txList;
        RLPReader.RLPItem[] memory sigList;
        (txList, sigList, ) = decodeTransaction(txBytes);

        // must be a direct spend
        require((exitingTxPos[0] == txList[0].toUint() && exitingTxPos[1] == txList[1].toUint()&& exitingTxPos[2] == txList[2].toUint() && exitingTxPos[3] == txList[3].toUint())
            || (exitingTxPos[0] == txList[5].toUint() && exitingTxPos[1] == txList[6].toUint()&& exitingTxPos[2] == txList[7].toUint() && exitingTxPos[3] == txList[8].toUint()),
            "challenging transaction is not a direct spend");

        // transaction to be challenged should have a pending exit
        exit storage exit_ = exitingTxPos[3] == 0 ? 
            txExits[blockIndexFactor*exitingTxPos[0] + txIndexFactor*exitingTxPos[1] + exitingTxPos[2]] : depositExits[exitingTxPos[3]];
        require(exit_.state == ExitState.Pending, "no pending exit to challenge");

        // confirm challenging transcation's inclusion and confirm signature
        childBlock memory blk = childChain[challengingTxPos[0]];

        bytes32 merkleHash = sha256(txBytes);
        bytes32 confirmationHash = sha256(abi.encodePacked(merkleHash, blk.root));
        require(exit_.owner == confirmationHash.recover(confirmSignature), "mismatch in exit owner and confirm signature");
        require(merkleHash.checkMembership(challengingTxPos[1], blk.root, proof, blk.numTxns), "incorrect merkle proof");

        // exit successfully challenged. Award the sender with the bond
        balances[msg.sender] = balances[msg.sender].add(minExitBond);
        totalWithdrawBalance = totalWithdrawBalance.add(minExitBond);
        emit AddedToBalances(msg.sender, minExitBond);

        // reflect challenged state
        exit_.state = ExitState.Challenged;
        emit ChallengedExit(exit_.position, exit_.owner, exit_.amount - exit_.committedFee);
    }

    function finalizeDepositExits() public { finalize(depositExitQueue, true); }
    function finalizeTransactionExits() public { finalize(txExitQueue, false); }

    // Finalizes exits by iterating through either the depositExitQueue or txExitQueue.
    // Users can determine the number of exits they're willing to process by varying
    // the amount of gas allow finalize*Exits() to process.
    // Each transaction takes < 80000 gas to process.
    function finalize(uint256[] storage queue, bool isDeposits)
        private
    {
        if (queue.length == 0) return;

        // retrieve the lowest priority and the appropriate exit struct
        uint256 priority = queue[0];
        exit memory currentExit;
        uint256 position;
        // retrieve the right 128 bits from the priority to obtain the position
        assembly {
   	        position := and(priority, div(not(0x0), exp(256, 16)))
		}

        currentExit = isDeposits ? depositExits[position] : txExits[position];

        /*
        * Conditions:
        *   1. Exits exist
        *   2. Exits must be a week old
        *   3. Funds must exist for the exit to withdraw
        */
        uint256 amountToAdd;
        while ((block.timestamp - currentExit.createdAt) > 1 weeks &&
               currentExit.amount.add(minExitBond) <= address(this).balance - totalWithdrawBalance &&
               gasleft() > 80000) {

            // skip currentExit if it is not in 'started/pending' state.
            if (currentExit.state != ExitState.Pending) {
                queue.delMin();
            } else {
                // reimburse the bond but remove fee allocated for the operator
                amountToAdd = currentExit.amount.add(minExitBond).sub(currentExit.committedFee);
                balances[currentExit.owner] = balances[currentExit.owner].add(amountToAdd);
                totalWithdrawBalance = totalWithdrawBalance.add(amountToAdd);

                if (isDeposits)
                    depositExits[position].state = ExitState.Finalized;
                else
                    txExits[position].state = ExitState.Finalized;

                emit FinalizedExit(currentExit.position, currentExit.owner, amountToAdd);
                emit AddedToBalances(currentExit.owner, amountToAdd);

                // move onto the next oldest exit
                queue.delMin();
            }

            if (queue.length == 0) {
                return;
            }

            // move onto the next oldest exit
            priority = queue[0];
            
            // retrieve the right 128 bits from the priority to obtain the position
            assembly {
   			    position := and(priority, div(not(0x0), exp(256, 16)))
		    }
             
            currentExit = isDeposits ? depositExits[position] : txExits[position];
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

        // will revert the above deletion if it fails
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
}
