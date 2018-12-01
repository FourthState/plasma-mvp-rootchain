let RootChain = artifacts.require("RootChain");

let { catchError, toHex } = require("../utilities.js");

contract('[RootChain] Miscellaneous', async (accounts) => {

    let rootchain;
    let authority = accounts[0];
    beforeEach(async () => {
        rootchain = await RootChain.new({from: authority});
    });

    it("Will not revert finalizeExit with an empty queue", async () => {
        await rootchain.finalizeDepositExits();
        await rootchain.finalizeTransactionExits();
    });

    it("Can submit more than one merkle root", async () => {
        let root1 = web3.sha3("root1").slice(2);
        let root2 = web3.sha3("root2").slice(2);
        let roots = root1 + root2;

        let lastCommitedBlock = 0;
        await rootchain.submitBlock(toHex(roots), 1, {from: authority});

        assert.equal((await rootchain.lastCommittedBlock.call()).toNumber(), 2, "blocknum incremented incorrectly");
        assert.equal((await rootchain.childChain.call(1))[0], toHex(root1), "mismatch in block root");
        assert.equal((await rootchain.childChain.call(2))[0], toHex(root2), "mismatch in block root");
    });

    it("Enforced block number ordering", async () => {
        let root1 = web3.sha3("root1").slice(2)
        let root3 = web3.sha3("root3").slice(2)

        await rootchain.submitBlock(toHex(root1), 1);
        let err;
        [err] = await catchError(rootchain.submitBlock(toHex(root3), 3));
        if (err == null)
            assert.fail("Allowed block submission with inconsistent ordering");
    });
});
