// external libraries
let RLP = require('rlp');
let assert = require('chai').assert;

let RootChain = artifacts.require("RootChain");

let utilities = require('./utilities.js');
let rootchainHelpers = require('./rootchain_helpers.js');

/*
 * Alot of the tests contain duplicated transactions
 * submitted to the rootchain to avoid wierd effects
 *
 */

contract('Block Submissions', async (accounts) => {
    // one rootchain contract for all tests
    let rootchain;
    let minExitBond = 10000;
    before(async () => {
        rootchain = await RootChain.deployed();
    });

    let authority = accounts[0];

    it("Owned by the correct address", async () => {
        let owner = await rootchain.owner.call();
        assert(owner == authority);
    })

    it("Submit block from authority", async () => {
        let curr = parseInt(await rootchain.currentChildBlock.call());

        // waiting at least 5 root chain blocks before submitting a block
        let blockRoot = '2984748479872';
        await rootchainHelpers.submitBlockCheck(rootchain, authority, blockRoot, accounts[0], 5, true, curr);

        let childBlock = await rootchain.getChildChain.call(curr);
        assert.equal(web3.toUtf8(childBlock[0]), blockRoot, 'Child block merkle root does not match submitted merkle root.');
    });

    it("Depositing a block", async () => {
        let depositAmount = 50000;
        let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, accounts[2], depositAmount, 0, 0, 0]);

        await rootchainHelpers.submitValidDeposit(rootchain, accounts[2], txBytes, depositAmount);
    });

    it("Deposit then submit block", async () => {
        let depositAmount = 50000;
        let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, accounts[2], depositAmount, 0, 0, 0]);

        let prevValidatorBlock, prevDepositBlock, currValidatorBlock, currDepositBlock;
        [prevValidatorBlock, prevDepositBlock, currValidatorBlock, currDepositBlock]
            = await rootchainHelpers.submitValidDeposit(rootchain, accounts[2], txBytes, depositAmount);

        await rootchainHelpers.submitBlockCheck(rootchain, authority, '2984748479872', accounts[0], 5, true, currValidatorBlock);
        let nextDepositBlock = parseInt(await rootchain.currentDepositBlock.call());
        assert.equal(nextDepositBlock, 1, "Deposit Block did not reset");
    });

    it("Invalid deposits", async () => {
        let validatorBlock = parseInt(await rootchain.currentChildBlock.call())

        let txBytes1 = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
        await rootchainHelpers.submitInvalidDeposit(rootchain, accounts[2], validatorBlock, txBytes1, 50);

        let txBytes2 = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, accounts[2], 50000, accounts[3], 10000, 0]);
        await rootchainHelpers.submitInvalidDeposit(rootchain, accounts[2], validatorBlock, txBytes2, 50000);

        let txBytes3 = RLP.encode([3, 5, 0, 0, 0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
        await rootchainHelpers.submitInvalidDeposit(rootchain, accounts[2], validatorBlock, txBytes3, 50000);
    });

    it("Deposit after unseen submitted block", async () => {
        let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
        let validatorBlock = parseInt(await rootchain.currentChildBlock.call())

        await rootchainHelpers.submitBlockCheck(rootchain, authority, '578484785954', accounts[0], 5, true, validatorBlock);

        await rootchainHelpers.submitInvalidDeposit(rootchain, accounts[2], validatorBlock, txBytes, 50000);
    });

    it("Submit block from someone other than authority", async () => {
        let prev = parseInt(await rootchain.currentChildBlock.call());

        await rootchainHelpers.submitBlockCheck(rootchain, authority, '496934090963', accounts[1], 5, false);

        let curr = parseInt(await rootchain.currentChildBlock.call());
        assert.equal(prev, curr, "Allowed submit block from someone other than authority!");
    });

    it("Submit block within 6 rootchain blocks", async () => {
        // First submission waits and passes
        let validatorBlock = parseInt(await rootchain.currentChildBlock.call())
        await rootchainHelpers.submitBlockCheck(rootchain, authority, '2984748479872', accounts[0], 5, true, validatorBlock);

        // Second submission does not wait and therfore fails.
        await rootchainHelpers.submitBlockCheck(rootchain, authority, '8473748479872', accounts[0], 3, false);
    });
});
