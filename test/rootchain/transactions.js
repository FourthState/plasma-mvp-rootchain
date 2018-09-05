let RLP = require('rlp');
let assert = require('chai').assert

let RootChain = artifacts.require('RootChain');
let { fastForward, mineNBlocks, zeroHashes, proof } = require('./rootchain_helpers.js');
let { toHex, catchError } = require('../utilities.js');

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

        fastForward(one_week + 100);

        await rootchain.finalizeTransactionExits();

        let balance = (await rootchain.balanceOf.call(accounts[1])).toNumber();
        assert.equal(balance, amount + minExitBond);

        let position = 1000000*txPos[0];
        let exit = await rootchain.getTransactionExit.call(position);
        assert.equal(exit[3], 3, "exit's state not set to finalized");
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
});
