let RLP = require('rlp');
let assert = require('chai').assert

let RootChain = artifacts.require('RootChain');
let { mineNBlocks, zeroHashes } = require('./rootchain_helpers.js');
let { toHex } = require('../utilities.js');

contract('[RootChain] Transactions', async (accounts) => {
    let rootchain;
    let authority = accounts[0];
    let minExitBond = 10000;

    // deploy the rootchain contract before each test.
    // deposit from accounts[0] and mine the first block
    // which includes a spend of that deposit to account[1]
    let amount = 100;
    beforeEach(async () => {
        rootchain = await RootChain.new({from: authority});
        
        let nonce = (await rootchain.depositNonce.call()).toNumber();
        await rootchain.deposit(accounts[1], {from: accounts[0], value: amount});

        // deposit is the first input. spending entire deposit to accounts[1]
        let txBytes = Array(17).fill(0);
        txBytes[9] = nonce; txBytes[12] = accounts[1]; txBytes[13] = amount;
        txBytes = RLP.encode(txBytes);
        let txHash = web3.sha3(txBytes.toString('hex'), {encoding: 'hex'});

        // create signature by deposit owner. Second signature should be zero
        let sigs = (await web3.eth.sign(accounts[1], txHash));
        sigs = sigs + Buffer.alloc(65).toString('hex');

        // include this transaction in the next block
        let merkleHash = web3.sha3(txHash.slice(2) + sigs, {encoding: 'hex'});
        let root = merkleHash;
        for (let i = 0; i < 16; i++)
            root = web3.sha3(root + zeroHashes[i], {encoding: 'hex'}).slice(2)
        let blockNum = (await rootchain.currentChildBlock.call()).toNumber();
        mineNBlocks(5); // presumed finality before submitting the block
        await rootchain.submitBlock(toHex(root), {from: authority});
    });

    it("Allows only the utxo owner to start an exit", async () => {
    });
});
