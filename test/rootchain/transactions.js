let RLP = require('rlp');
let assert = require('chai').assert

let RootChain = artifacts.require('RootChain');
let { mineNBlocks, zeroHashes, proof } = require('./rootchain_helpers.js');
let { toHex, catchError } = require('../utilities.js');

contract('[RootChain] Transactions', async (accounts) => {
    let rootchain;
    let authority = accounts[0];
    let minExitBond = 10000;

    // deploy the rootchain contract before each test.
    // deposit from accounts[0] and mine the first block which
    // includes a spend of that full deposit to account[1] (first input)
    let amount = 100;
    let txPos, txBytes;
    let sigs, confirmSig;
    beforeEach(async () => {
        rootchain = await RootChain.new({from: authority});
        
        let nonce = (await rootchain.depositNonce.call()).toNumber();
        await rootchain.deposit(accounts[0], {from: accounts[0], value: amount});

        // deposit is the first input. spending entire deposit to accounts[1]
        txBytes = Array(17).fill(0);
        txBytes[3] = nonce; txBytes[12] = accounts[1]; txBytes[13] = amount;
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
        confirmSig = await web3.eth.sign(accounts[0], confirmHash);

        txPos = [blockNum, 0, 0];
    });

    it("Allows only the utxo owner to start an exit", async () => {
        let err;
        [err] = await catchError(rootchain.startTransactionExit(txPos,
            toHex(txBytes), toHex(proof), toHex(sigs), {from: accounts[0], value: minExitBond}));
        if (!err)
            assert.fail("exit start from someone other than the utxo owner");
    });

    it("Refunds excess funds for overpayed bond", async () => {
        let confirmSignatures = confirmSig + Buffer.alloc(65).toString('hex');

        await rootchain.startTransactionExit(txPos,
            toHex(txBytes), toHex(proof), toHex(sigs), toHex(confirmSignatures),
            {from: accounts[1], value: minExitBond + 100});

        let balance = (await rootchain.balanceOf(accounts[1])).toNumber();
        assert.equal(balance, 100, "excess funds not repayed back to caller");
    });

    it("Only allows exiting a utxo once", async () => {
    });
});
