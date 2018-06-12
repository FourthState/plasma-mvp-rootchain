// external libraries
let RLP = require('rlp');
let assert = require('chai').assert;

let {
    to,
    toHex,
    createAndDepositTX,
    waitForNBlocks,
    proofForDepositBlock,
    zeroHashes,
} = require('./utilities.js');

let RootChain = artifacts.require("RootChain");

/*
 * Alot of the tests contain duplicated transactions
 * submitted to the rootchain to avoid wierd effects
 *
 */

contract('RootChain', async (accounts) => {
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
        await waitForNBlocks(5, authority, accounts);

        let blockRoot = '2984748479872';
        await rootchain.submitBlock(web3.fromAscii(blockRoot));
        let next = parseInt(await rootchain.currentChildBlock.call());
        let interval = parseInt(await rootchain.childBlockInterval.call())

        assert.equal(curr + interval, next, "Child block did not increment");

        let childBlock = await rootchain.getChildChain.call(curr);
        assert.equal(web3.toUtf8(childBlock[0]), blockRoot, 'Child block merkle root does not match submitted merkle root.');
    });

    it("Depositing a block", async () => {
        let depositAmount = 50000;
        let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, accounts[2], depositAmount, 0, 0, 0]);
        let validatorBlock = parseInt(await rootchain.currentChildBlock.call())
        let prev =  parseInt(await rootchain.getDepositBlock.call());

        let result = await rootchain.deposit(validatorBlock, toHex(txBytes), {from: accounts[2], value: depositAmount});

        assert.equal(result.logs[0].args.depositor, accounts[2], 'Deposit event does not match depositor address.');
        assert.equal(parseInt(result.logs[0].args.amount), depositAmount, 'Deposit event does not match deposit amount.');

        let curr = parseInt(await rootchain.getDepositBlock.call());
        assert.equal(prev + 1, curr, "Child block did not increment");
    });

    it("Deposit then submit block", async () => {
        let depositAmount = 50000;
        let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, accounts[2], depositAmount, 0, 0, 0]);
        let prevValidatorBlock = parseInt(await rootchain.currentChildBlock.call());
        let prevDepositBlock = parseInt(await rootchain.getDepositBlock.call())

        await rootchain.deposit(prevValidatorBlock, toHex(txBytes), {from: accounts[2], value: depositAmount});
        let currValidatorBlock = parseInt(await rootchain.currentChildBlock.call());
        let currDepositBlock = parseInt(await rootchain.getDepositBlock.call())

        assert.equal(prevValidatorBlock, currValidatorBlock, "Child block incremented after Deposit.");
        assert.equal(prevDepositBlock + 1, currDepositBlock, "Deposit block did not increment")

        await waitForNBlocks(5, authority, accounts);

        let interval = parseInt(await rootchain.childBlockInterval.call())

        let blockRoot = '2984748479872';
        await rootchain.submitBlock(web3.fromAscii(blockRoot));
        let nextBlockNum = parseInt(await rootchain.currentChildBlock.call());
        let nextDepositBlock = parseInt(await rootchain.currentDepositBlock.call())
        assert.equal(currValidatorBlock + interval, nextBlockNum, "Child block did not increment by interval after submitting a block.");
        assert.equal(nextDepositBlock, 1, "Deposit Block did not reset")
    });

    it("Invalid deposits", async () => {
        let validatorBlock = parseInt(await rootchain.currentChildBlock.call())
        let err;

        let txBytes1 = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
        [err] = await to(rootchain.deposit(validatorBlock, toHex(txBytes1), {from: accounts[2], value: 50}));
        if (!err) {
            assert.fail("Invalid deposit, did not revert");
        }

        let txBytes2 = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, accounts[2], 50000, accounts[3], 10000, 0]);
        [err] = await to(rootchain.deposit(validatorBlock, toHex(txBytes2), {from: accounts[2], value: 50000}));
        if (!err) {
            assert.fail("Invalid deposit, did not revert");
        }

        let txBytes3 = RLP.encode([3, 5, 0, 0, 0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
        [err] = await to(rootchain.deposit(validatorBlock, toHex(txBytes3), {from: accounts[2], value: 50000}));
        if (!err) {
            assert.fail("Invalid deposit, did not revert");
        }
    });

    it("Deposit after unseen submitted block", async () => {
        let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
        let validatorBlock = parseInt(await rootchain.currentChildBlock.call())

        await waitForNBlocks(5, authority, accounts);

        await rootchain.submitBlock(web3.fromAscii('578484785954'));
        let interval = parseInt(await rootchain.childBlockInterval.call())
        let newValidatorBlock = parseInt(await rootchain.currentChildBlock.call())
        assert.equal(validatorBlock + interval, newValidatorBlock, "Validator Block doesn't increment")

        let err;
        [err] = await to(rootchain.deposit(validatorBlock, toHex(txBytes), {from: accounts[2], value: 50000}))

        if(!err)
            assert.fail("Allowed deposit to be added after unseen block")

    });

    it("Submit block from someone other than authority", async () => {
        await waitForNBlocks(5, authority, accounts);

        let prev = parseInt(await rootchain.currentChildBlock.call());

        let err;
        [err] = await to(rootchain.submitBlock(web3.fromAscii('496934090963'), {from: accounts[1]}));
        if (!err) {
            assert.fail("Submit allowed from wrong person!"); // this line should never be reached
        }

        let curr = parseInt(await rootchain.currentChildBlock.call());
        assert.equal(prev, curr, "Allowed submit block from someone other than authority!");
    });

    it("Submit block within 6 rootchain blocks", async () => {
        // First submission waits and passes
        await waitForNBlocks(5, authority, accounts);
        let blockRoot1 = '2984748479872';
        await rootchain.submitBlock(web3.fromAscii(blockRoot1));

        // Second submission does not wait and therfore fails.
        await waitForNBlocks(3, authority, accounts);
        let blockRoot2 = '8473748479872';
        let err;
        [err] = await to(rootchain.submitBlock(web3.fromAscii(blockRoot2)));
        if (!err) {
            assert.fail("Submit does not wait 6 rootchain blocks.");
        }
    });
});
