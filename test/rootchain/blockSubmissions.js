let assert = require('chai').assert;

let RootChain = artifacts.require("RootChain");

let mineNBlocks = require('./rootchain_helpers.js').mineNBlocks;
let catchError = require('../utilities.js').catchError;

contract('[RootChain] Block Submissions', async (accounts) => {
    let rootchain;
    let authority = accounts[0];
    let minExitBond = 10000;
    before(async () => {
        rootchain = await RootChain.new({from: authority});
    });

    it("Submit block from authority", async () => {
        let blkNum = (await rootchain.currentChildBlock.call()).toNumber();

        // waiting at least 5 root chain blocks before submitting a block
        mineNBlocks(5);

        let blockRoot = '2984748479872';
        let tx = await rootchain.submitBlock(web3.fromAscii(blockRoot), {from: authority});
        // BlockSubmitted event
        assert.equal(web3.toUtf8(tx.logs[0].args.root), blockRoot, "incorrect block root in BlockSubmitted event");
        assert.equal(tx.logs[0].args.position.toNumber(), blkNum, "incorrect block number in BlockSubmitted event");

        let childBlock = (await rootchain.getChildBlock.call(blkNum));
        assert.equal(web3.toUtf8(childBlock[0]), blockRoot, 'Child block merkle root does not match submitted merkle root.');
    });

    it("Submit block from someone other than authority", async () => {
        let prev = (await rootchain.currentChildBlock.call()).toNumber();

        mineNBlocks(5);
        let [err] = await catchError(rootchain.submitBlock(web3.fromAscii('578484785954'), {from: accounts[1]}));
        if (!err)
            assert.fail("Submitted blocked without being the authority");

        let curr = (await rootchain.currentChildBlock.call()).toNumber();
        assert.equal(prev, curr, "Child blocknum incorrectly changed");
    });

    it("Submit block within 6 rootchain blocks", async () => {
        // First submission waits and passes
        let blkNum = (await rootchain.currentChildBlock.call()).toNumber();

        mineNBlocks(5);
        let root = '2984748479872'
        let tx = await rootchain.submitBlock(web3.fromAscii(root), {from: authority});
        // BlockSubmitted event
        assert.equal(web3.toUtf8(tx.logs[0].args.root), root, "incorrect block root in BlockSubmitted event");
        assert.equal(tx.logs[0].args.position.toNumber(), blkNum, "incorrect block number in BlockSubmitted event");

        // Second submission does not wait and therfore fails.
        mineNBlocks(3);
        let [err] = await catchError(rootchain.submitBlock(web3.fromAscii('696969696969'), {from: authority}));
        if (!err)
            assert.fail("Submitted block without presumed finality");
    });
});
