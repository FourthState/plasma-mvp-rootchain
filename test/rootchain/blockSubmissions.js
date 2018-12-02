let assert = require('chai').assert;

let RootChain = artifacts.require("RootChain");

let catchError = require('../utilities.js').catchError;

contract('[RootChain] Block Submissions', async (accounts) => {
    let rootchain;
    let authority = accounts[0];
    let minExitBond = 10000;
    before(async () => {
        rootchain = await RootChain.new({from: authority});
    });

    it("Submit block from authority", async () => {
        let root = web3.sha3('1234');
        let tx = await rootchain.submitBlock(root, [1], 1, {from: authority});

        // BlockSubmitted event
        assert.equal(tx.logs[0].args.root, root, "incorrect block root in BlockSubmitted event");
        assert.equal(tx.logs[0].args.blockNumber.toNumber(), 1, "incorrect block number in BlockSubmitted event");

        assert.equal((await rootchain.childChain.call(1))[0], root, 'Child block merkle root does not match submitted merkle root.');
    });

    it("Submit block from someone other than authority", async () => {
        let prev = (await rootchain.lastCommittedBlock.call()).toNumber();

        let [err] = await catchError(rootchain.submitBlock(web3.sha3('578484785954'), [1], 1, {from: accounts[1]}));
        if (!err)
            assert.fail("Submitted blocked without being the authority");

        let curr = (await rootchain.lastCommittedBlock.call()).toNumber();
        assert.equal(prev, curr, "Child blocknum incorrectly changed");
    });
});
