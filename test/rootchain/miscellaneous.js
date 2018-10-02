let RootChain = artifacts.require("RootChain");

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
});
