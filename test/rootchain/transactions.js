let RLP = require('rlp');
let assert = require('chai').assert

let RootChain = artifacts.require('RootChain');
let { fastForward, mineNBlocks, zeroHashes, proof } = require('./rootchain_helpers.js');
let { toHex, catchError, generateMerkleRootAndProof } = require('../utilities.js');

contract('[RootChain] Transactions', async (accounts) => {
    let rootchain;
    let one_week = 604800; // in seconds
    let authority = accounts[0];
    let minExitBond = 10000;

    // deploy the rootchain contract before each test.
    // deposit from accounts[0] and mine the first block which
    // includes a spend of that full deposit to account[1] (first input)
    let amount = 100;
    let depositNonce;
    let txPos, txBytes;
    let sigs, confirmSignatures;
    beforeEach(async () => {
        rootchain = await RootChain.new({from: authority});

        depositNonce = (await rootchain.depositNonce.call()).toNumber();
        await rootchain.deposit(accounts[0], {from: accounts[0], value: amount});

        // deposit is the first input. spending entire deposit to accounts[1]
        txBytes = Array(17).fill(0);
        txBytes[3] = depositNonce; txBytes[12] = accounts[1]; txBytes[13] = amount;
        txBytes = RLP.encode(txBytes);
        let txHash = web3.sha3(txBytes.toString('hex'), {encoding: 'hex'});

        // create signature by deposit owner. Second signature should be zero
        sigs = await web3.eth.sign(accounts[0], txHash);
        sigs = sigs + Buffer.alloc(65).toString('hex');

        // include this transaction in the next block
        let merkleHash = web3.sha3(txHash.slice(2) + sigs.slice(2), {encoding: 'hex'});
        let root = merkleHash;
        for (let i = 0; i < 16; i++)
            root = web3.sha3(root + zeroHashes[i], {encoding: 'hex'}).slice(2)
        let blockNum = (await rootchain.currentChildBlock.call()).toNumber();
        mineNBlocks(5); // presumed finality before submitting the block
        await rootchain.submitBlock(toHex(root), {from: authority});

        // create the confirm sig
        let confirmHash = web3.sha3(merkleHash.slice(2) + root, {encoding: 'hex'});
        confirmSignatures = await web3.eth.sign(accounts[0], confirmHash);

        txPos = [blockNum, 0, 0];
    });

    it("Allows only the utxo owner to start an exit", async () => {
        let err;
        [err] = await catchError(rootchain.startTransactionExit(txPos,
            toHex(txBytes), toHex(proof), toHex(sigs), {from: accounts[0], value: minExitBond}));
        if (!err)
            assert.fail("exit start from someone other than the utxo owner");
    });

    it("Catches StartedTransactionExit event", async () => {
        let tx = await rootchain.startTransactionExit(txPos,
            toHex(txBytes), toHex(proof), toHex(sigs), toHex(confirmSignatures),
            {from: accounts[1], value: minExitBond});

        let position = 1000000*txPos[0];
        assert.equal(tx.logs[0].args.position.toNumber(), position, "StartedTransactionExit event emits incorrect priority");
        assert.equal(tx.logs[0].args.owner, accounts[1], "StartedTransactionExit event emits incorrect owner");
        assert.equal(tx.logs[0].args.amount.toNumber(), amount, "StartedTransactionExit event emits incorrect amount");
    });

    it("Can start and finalize a transaction exit", async () => {
        await rootchain.startTransactionExit(txPos,
            toHex(txBytes), toHex(proof), toHex(sigs), toHex(confirmSignatures),
            {from: accounts[1], value: minExitBond});

        fastForward(one_week + 1000);

        await rootchain.finalizeTransactionExits();

        let balance = (await rootchain.balanceOf.call(accounts[1])).toNumber();
        assert.equal(balance, amount + minExitBond);

        let position = 1000000*txPos[0];
        let exit = await rootchain.getTransactionExit.call(position);
        assert.equal(exit[3].toNumber(), 3, "exit's state not set to finalized");
    });

    it("Requires sufficient bond and refunds excess if overpayed", async () => {
        let err;
        [err] = await catchError(rootchain.startTransactionExit(txPos,
            toHex(txBytes), toHex(proof), toHex(sigs), toHex(confirmSignatures),
            {from: accounts[1], value: minExitBond - 100}));
        if (!err)
            assert.fail("started exit with insufficient bond");

        await rootchain.startTransactionExit(txPos,
            toHex(txBytes), toHex(proof), toHex(sigs), toHex(confirmSignatures),
            {from: accounts[1], value: minExitBond + 100});

        let balance = (await rootchain.balanceOf(accounts[1])).toNumber();
        assert.equal(balance, 100, "excess funds not repayed back to caller");
    });

    it("Only allows exiting a utxo once", async () => {
        await rootchain.startTransactionExit(txPos,
            toHex(txBytes), toHex(proof), toHex(sigs), toHex(confirmSignatures),
            {from: accounts[1], value: minExitBond});

        let err;
        [err] = await catchError(rootchain.startTransactionExit(txPos,
            toHex(txBytes), toHex(proof), toHex(sigs), toHex(confirmSignatures),
            {from: accounts[1], value: minExitBond}));

        if (!err)
            assert.fail("reopened the same exit while already a pending one existed");

        fastForward(one_week + 100);

        [err] = await catchError(rootchain.startTransactionExit(txPos,
            toHex(txBytes), toHex(proof), toHex(sigs), toHex(confirmSignatures),
            {from: accounts[1], value: minExitBond}));

        if (!err)
            assert.fail("reopened the same exit after already finalized");
    });

    it("Cannot exit a utxo with a finalized deposit input", async () => {
        await rootchain.startDepositExit(depositNonce, {from: accounts[0], value: minExitBond});

        let err;
        [err] = await catchError(rootchain.startTransactionExit(txPos,
            toHex(txBytes), toHex(proof), toHex(sigs), toHex(confirmSignatures),
            {from: accounts[1], value: minExitBond}));

        if (!err)
            assert.fail("started an exit with an input who has a pending exit state");
    });

    it("Can challenge a spend of a utxo", async () => {
        // spend all funds to account[2] and mine the block
        // deposit is the first input. spending entire deposit to accounts[1]
        let newTxBytes = Array(17).fill(0);
        newTxBytes[0] = txPos[0]; newTxBytes[1] = txPos[1]; newTxBytes[2] = txPos[2]; // first input
        newTxBytes[12] = accounts[2]; newTxBytes[13] = amount; // first output
        newTxBytes = RLP.encode(newTxBytes);
        let txHash = web3.sha3(newTxBytes.toString('hex'), {encoding: 'hex'});

        // create signature by deposit owner. Second signature should be zero
        let newSigs = await web3.eth.sign(accounts[1], txHash);
        newSigs += Buffer.alloc(65).toString('hex');

        // include this transaction in the next block
        let merkleHash = web3.sha3(txHash.slice(2) + newSigs.slice(2), {encoding: 'hex'});
        let root = merkleHash;
        for (let i = 0; i < 16; i++)
            root = web3.sha3(root + zeroHashes[i], {encoding: 'hex'}).slice(2)
        let blockNum = (await rootchain.currentChildBlock.call()).toNumber();
        mineNBlocks(5); // presumed finality before submitting the block
        await rootchain.submitBlock(toHex(root), {from: authority});

        // create the confirm sig
        let confirmHash = web3.sha3(merkleHash.slice(2) + root, {encoding: 'hex'});
        let newConfirmSignatures = await web3.eth.sign(accounts[1], confirmHash);

        // start an exit of the original utxo
        await rootchain.startTransactionExit(txPos,
            toHex(txBytes), toHex(proof), toHex(sigs), toHex(confirmSignatures),
            {from: accounts[1], value: minExitBond});

        // try to exit this new utxo and realize it cannot. child has a pending exit
        let err;
        [err] = await catchError(rootchain.startTransactionExit([blockNum, 0, 0],
            toHex(newTxBytes), toHex(proof), toHex(newSigs), toHex(newConfirmSignatures),
            {from: accounts[2], value: minExitBond}));
        if (!err)
            assert.fail("started exit when the child has a pending exit");

        // matching input required
        [err] = await catchError(rootchain.challengeTransactionExit([txPos[0], 0, 1], [blockNum, 0, 0],
            toHex(newTxBytes), toHex(newSigs), toHex(proof), toHex(newConfirmSignatures.substring(0,65),
            {from: accounts[2]})));
        if (!err)
            assert.fail("challenged with transaction that is not a direct child");

        // challenge
        await rootchain.challengeTransactionExit(txPos, [blockNum, 0, 0],
            toHex(newTxBytes), toHex(newSigs), toHex(proof), toHex(newConfirmSignatures),
            {from: accounts[2]});

        let balance = (await rootchain.balanceOf.call(accounts[2])).toNumber();
        assert.equal(balance, minExitBond, "exit bond not rewarded to challenger");

        // start an exit of the new utxo after successfully challenging
        await rootchain.startTransactionExit([blockNum, 0, 0],
            toHex(newTxBytes), toHex(proof), toHex(newSigs), toHex(newConfirmSignatures),
            {from: accounts[2], value: minExitBond});
    });

    it("Rejects exiting a transaction whose sole input is the second", async () => {
        let nonce = (await rootchain.depositNonce.call()).toNumber();
        await rootchain.deposit(accounts[2], {from: accounts[2], value: 100});

        // construct transcation with second input as the deposit
        let txBytes = Array(17).fill(0);
        txBytes[9] = nonce; txBytes[12] = accounts[1]; txBytes[13] = 100;
        txBytes = RLP.encode(txBytes);
        let txHash = web3.sha3(txBytes.toString('hex'), {encoding: 'hex'});

        // create signature by deposit owner. Second signature should be zero
        let sigs = Buffer.alloc(65).toString('hex');
        sigs = sigs + (await web3.eth.sign(accounts[2], txHash)).slice(2);

        let merkleHash = web3.sha3(txHash.slice(2) + sigs, {encoding: 'hex'});

        // include this transaction in the next block
        let root = merkleHash;
        for (let i = 0; i < 16; i++)
            root = web3.sha3(root + zeroHashes[i], {encoding: 'hex'}).slice(2)
        let blockNum = (await rootchain.currentChildBlock.call()).toNumber();

        mineNBlocks(5); // presumed finality before submitting the block
        await rootchain.submitBlock(toHex(root), {from: authority});

        // create the confirm sig
        let confirmHash = web3.sha3(merkleHash.slice(2) + root, {encoding: 'hex'});
        let confirmSig = await web3.eth.sign(accounts[2], confirmHash);

        let err;
        [err] = await catchError(rootchain.startTransactionExit([blockNum, 0, 0],
            toHex(txBytes), toHex(proof), toHex(sigs), toHex(confirmSig), {from: accounts[1], value: minExitBond}));
        if (!err)
            assert.fail("Allowed an transaction exit with only a second input present");
    });

    it("Attempt a withdrawal delay attack", async () => {
        let five_days = 432000 // in seconds
        // accounts[1] spends deposit and creates 2 new utxos for themself
        let txBytes1 = Array(17).fill(0);
        txBytes1[0] = txPos[0]; txBytes1[1] = txPos[1]; txBytes1[2] = txPos[2]; // first input
        txBytes1[12] = accounts[1]; txBytes1[13] = amount / 2; // first output
        txBytes1[14] = accounts[1]; txBytes1[15] = amount / 2; // second output
        txBytes1 = RLP.encode(txBytes1);
        
        let txHash1 = web3.sha3(txBytes1.toString('hex'), {encoding: 'hex'});
        let sigs1 = await web3.eth.sign(accounts[1], txHash1);
        sigs1 += Buffer.alloc(65).toString('hex');
        
        let merkleHash1 = web3.sha3(txHash1.slice(2) + sigs1.slice(2), {encoding: 'hex'});
        let root1, proof1;
        [root1, proof1] = generateMerkleRootAndProof([merkleHash1], 0);
        let blockNum1 = (await rootchain.currentChildBlock.call()).toNumber();
        mineNBlocks(5);
        await rootchain.submitBlock(toHex(root1), {from: authority});

        // create confirmation signature
        let confirmationHash1 = web3.sha3(merkleHash1.slice(2) + root1.slice(2), {encoding: 'hex'});
        let confirmSigs1 = await web3.eth.sign(accounts[1], confirmationHash1);

        // accounts[1] spends (blockNum1, 0, 1) utxo, sends 1 utxo to themself and the other to accounts[2]
        let txBytes2 = Array(17).fill(0);
        txBytes2[0] = blockNum1; txBytes2[2] = 1; // first input
        txBytes2[12] = accounts[1]; txBytes2[13] = amount / 4; // first output
        txBytes2[14] = accounts[2]; txBytes2[15] = amount / 4; // second output
        txBytes2 = RLP.encode(txBytes2);

        let txHash2 = web3.sha3(txBytes2.toString('hex'), {encoding: 'hex'});
        let sigs2 = await web3.eth.sign(accounts[1], txHash2);
        sigs2 += Buffer.alloc(65).toString('hex');
        
        let merkleHash2 = web3.sha3(txHash2.slice(2) + sigs2.slice(2), {encoding: 'hex'});
        let root2, proof2;
        [root2, proof2] = generateMerkleRootAndProof([merkleHash2], 0);
        let blockNum2 = (await rootchain.currentChildBlock.call()).toNumber();
        mineNBlocks(5);
        await rootchain.submitBlock(toHex(root2), {from: authority});

        // create confirmation signature
        let confirmationHash2 = web3.sha3(merkleHash2.slice(2) + root2.slice(2), {encoding: 'hex'});
        let confirmSigs2 = await web3.eth.sign(accounts[1], confirmationHash2);
        
        // make utxos > 1 week old
        fastForward(one_week + 100);
        
        // start exit for accounts[2], last utxo to be created
        await rootchain.startTransactionExit([blockNum2, 0, 1],
            toHex(txBytes2), toHex(proof2), toHex(sigs2), toHex(confirmSigs2), {from: accounts[2], value: minExitBond});
        
        // increase time slightly, so exit by accounts[2] has better priority than accounts[1]
        fastForward(10);

        // start exit for accounts[1] utxo
        await rootchain.startTransactionExit([blockNum2, 0, 0], 
            toHex(txBytes2), toHex(proof2), toHex(sigs2), toHex(confirmSigs2), {from: accounts[1], value: minExitBond});
        
        // Fast Forward ~5 days
        fastForward(five_days);
        
        // Check to make sure challenge period has not ended
        let position = 1000000 * blockNum2 + 1;
        let currExit = await rootchain.getTransactionExit.call(position);
        assert.ok((currExit[2].add(604800)) > (await web3.eth.getBlock(await web3.eth.blockNumber)).timestamp);
        
        // start exit for accounts[1], oldest utxo avaliable
        await rootchain.startTransactionExit([blockNum1, 0, 0], 
            toHex(txBytes1), toHex(proof1), toHex(sigs1), toHex(confirmSigs1), {from: accounts[1], value: minExitBond});
        
        // Fast Forward < 1 week
        fastForward(five_days);
        
        // finalize exits should finalize accounts[2] then accounts[1]
        let finalizedExits = await rootchain.finalizeTransactionExits({from: authority});
        let finalizedExit = await rootchain.getTransactionExit.call(position);
        assert.equal(finalizedExits.logs[0].args.position, position, "Incorrect position for finalized tx");
        assert.equal(finalizedExits.logs[0].args.owner, accounts[2], "Incorrect finalized exit owner");
        assert.equal(finalizedExits.logs[0].args.amount.toNumber(), 25 + minExitBond, "Incorrect finalized exit amount.");
        assert.equal(finalizedExit[3].toNumber(), 3, "Incorrect finalized exit state.");
        
        // Check other exits
        position = 1000000 * blockNum2;
        finalizedExit = await rootchain.getTransactionExit.call(position);
        assert.equal(finalizedExits.logs[2].args.position, position, "Incorrect position for finalized tx");
        assert.equal(finalizedExits.logs[2].args.owner, accounts[1], "Incorrect finalized exit owner");
        assert.equal(finalizedExits.logs[2].args.amount.toNumber(), 25 + minExitBond, "Incorrect finalized exit amount.");
        assert.equal(finalizedExit[3].toNumber(), 3, "Incorrect finalized exit state.");

        // Last exit should still be pending
        position = 1000000 * blockNum1;
        let pendingExit = await rootchain.getTransactionExit.call(position);
        assert.equal(pendingExit[0], accounts[1], "Incorrect pending exit owner");
        assert.equal(pendingExit[1], 50, "Incorrect pending exit amount");
        assert.equal(pendingExit[3].toNumber(), 1, "Incorrect pending exit state.");

        // Fast Forward rest of challenge period
        fastForward(one_week);
        await rootchain.finalizeTransactionExits({from: authority});
        // Check that last exit was processed
        finalizedExit = await rootchain.getTransactionExit.call(position);
        assert.equal(finalizedExit[0], accounts[1], "Incorrect finalized exit owner");
        assert.equal(finalizedExit[1], 50, "Incorrect finalized exit amount");
        assert.equal(finalizedExit[3].toNumber(), 3, "Incorrect finalized exit state.");
     });

});
