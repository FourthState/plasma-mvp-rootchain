// external libraries
let RLP = require('rlp');
let assert = require('chai').assert;

let RootChain = artifacts.require("RootChain");

let rootchainHelpers = require('./rootchain_helpers.js');
let { catchError, toHex } = require('../utilities.js');

contract('Block Submissions', async (accounts) => {
    // one rootchain contract for all tests
    let rootchain;
    let minExitBond = 10000;
    before(async () => {
        rootchain = await RootChain.new();
    });

    let authority = accounts[0];

    it("Owned by the correct address", async () => {
        let owner = await rootchain.owner.call();
        assert(owner == authority);
    })

    it("Submit block from authority", async () => {
        let curr = (await rootchain.currentChildBlock.call()).toNumber();

        // waiting at least 5 root chain blocks before submitting a block
        rootchainHelpers.mineNBlocks(5, authority);

        let blockRoot = '2984748479872';
        await rootchain.submitBlock(web3.fromAscii(blockRoot), {from: authority});

        let childBlock = (await rootchain.getChildChain.call(curr));
        assert.equal(web3.toUtf8(childBlock[0]), blockRoot, 'Child block merkle root does not match submitted merkle root.');
    });

    it("Depositing a block", async () => {
        let prevValidatorBlock = (await rootchain.currentChildBlock.call()).toNumber();
        let prevDepositBlock = (await rootchain.getDepositBlock.call()).toNumber();

        let [result, ...rest] = await rootchainHelpers.createAndDepositTX(rootchain, accounts[2], 50000);

        let currValidatorBlock = (await rootchain.currentChildBlock.call()).toNumber();
        let currDepositBlock = (await rootchain.getDepositBlock.call()).toNumber();

        assert.equal(prevValidatorBlock, currValidatorBlock, "Child block incremented after Deposit.");
        assert.equal(prevDepositBlock + 1, currDepositBlock, "Deposit block did not increment");
        assert.equal(result.logs[0].args.depositor, accounts[2], 'Deposit event does not match depositor address.');
        assert.equal(result.logs[0].args.amount, 50000, 'Deposit event does not match deposit amount.');
        assert.equal(prevDepositBlock + 1, currDepositBlock, "Child block did not increment");
    });

    it("Invalid deposits", async () => {
        let validatorBlock = parseInt(await rootchain.currentChildBlock.call())
        let err;

        let txBytes1 = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
        [err] = await catchError(rootchain.deposit(validatorBlock, toHex(txBytes1), {from: accounts[2], value: 50}));
        if (!err)
            assert.fail("Submitted deposit with a value mismatch");

        let txBytes2 = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0, accounts[2], 50000, accounts[3], 10000, 0]);
        [err] = await catchError(rootchain.deposit(validatorBlock, toHex(txBytes2), {from: accounts[2], value: 50000}));
        if (!err)
            assert.fail("Submitted deposit with a nonzero denom for the second output");

        let txBytes3 = RLP.encode([3, 5, 0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
        [err] = await catchError(rootchain.deposit(validatorBlock, toHex(txBytes3), {from: accounts[2], value: 50000}));
        if (!err)
            assert.fail("Submitted deposit with required nonzero fields");
    });

    it("Deposit after unseen submitted block", async () => {
        let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
        let validatorBlock = (await rootchain.currentChildBlock.call()).toNumber();

        rootchainHelpers.mineNBlocks(5, authority);
        await rootchain.submitBlock(web3.fromAscii('578484785954'), {from: authority});

        let [err] = await catchError(rootchain.deposit(validatorBlock, toHex(txBytes), {from: accounts[2], value: 50000}));
        if (!err)
            assert.fail("Submitted deposit with incorrect commited validator block");
    });

    it("Submit block from someone other than authority", async () => {
        let prev = (await rootchain.currentChildBlock.call()).toNumber();

        rootchainHelpers.mineNBlocks(5, authority);
        let [err] = await catchError(rootchain.submitBlock(web3.fromAscii('578484785954'), {from: accounts[1]}));
        if (!err)
            assert.fail("Submitted blocked without being the authority");

        let curr = (await rootchain.currentChildBlock.call()).toNumber();
        assert.equal(prev, curr, "Child blocknum incorrectly changed");
    });

    it("Submit block within 6 rootchain blocks", async () => {
        // First submission waits and passes
        let validatorBlock = (await rootchain.currentChildBlock.call()).toNumber();

        rootchainHelpers.mineNBlocks(5, authority);
        await rootchain.submitBlock(web3.fromAscii('2984748479872'), {from: authority});

        // Second submission does not wait and therfore fails.
        rootchainHelpers.mineNBlocks(3, authority);
        let [err] = await catchError(rootchain.submitBlock(web3.fromAscii('696969696969'), {from: authority}));
        if (!err)
            assert.fail("Submitted block without presumed finality");
    });
});
