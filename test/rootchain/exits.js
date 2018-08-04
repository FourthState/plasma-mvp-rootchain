// external libraries
let RLP = require('rlp');
let assert = require('chai').assert;

let { catchError, toHex } = require('../utilities.js');
let rootchainHelpers = require('./rootchain_helpers.js');

let RootChain = artifacts.require("RootChain");

/*
 * Alot of the tests contain duplicated transactions
 * submitted to the rootchain to avoid wierd effects
 *
 */

contract('Exit Transactions', async (accounts) => {
    let rootchain;
    let minExitBond = 10000;
    let authority = accounts[0];
    before(async () => {
        // clean contract: needed because of balance dependent tests (last test)
        rootchain = await RootChain.new();
    });

    it("Start an exit", async () => {
        let depositAmount = 5000;

        // submit a deposit
        [tx, blockNum, txBytes] = await rootchainHelpers.createAndDepositTX(rootchain, accounts[2], depositAmount);

        let txPos = [blockNum, 0, 0];
        await rootchainHelpers.startExit(rootchain, accounts[2], depositAmount, minExitBond, blockNum, txPos, txBytes);
    });

    it("Try to exit with invalid parameters", async () => {
        // submit a deposit
        [tx, blockNum, txBytes] = await rootchainHelpers.createAndDepositTX(rootchain, accounts[2], 5000);

        // start the exit
        let txPos = [blockNum, 0, 0];
        let exitSigs = Buffer.alloc(130);

        // Invalid owner started the exit
        let err;
        [err] = await catchError(rootchain.startExit(txPos, toHex(txBytes),
            toHex(rootchainHelpers.proofForDepositBlock), toHex(exitSigs), {from: accounts[1], value: 5000}));
        if (!err)
            assert.fail("Started exit with invalid owner");

        // Exit started with insufficient bond
        [err] = await catchError(rootchain.startExit(txPos, toHex(txBytes),
            toHex(rootchainHelpers.proofForDepositBlock), toHex(exitSigs), {from: accounts[2], value: 10}));
        if (!err)
            assert.fail("Started exit with invalid owner");
    });

    it("Start exit, finalize after a week, and withdraw", async () => {
        let depositAmount = 5000;

        // create a new deposit
        [tx, blockNum, txBytes] = await rootchainHelpers.createAndDepositTX(rootchain, accounts[2], depositAmount);

        /*
         * authority will eat up the gas cost in the finalize exit
         * TODO: finalizeExit implementation needs to be changed to prevent a
         * revert from occuring if gas runs out
         */

        // fast forward and finalize any exits from previous tests
        await rootchainHelpers.fastForward();
        await rootchain.finalizeExits({from: authority});

        // start a new exit
        let txPos = [blockNum, 0, 0];
        let priority = 1000000000 * blockNum;
        await rootchainHelpers.startExit(rootchain, accounts[2], depositAmount, minExitBond, blockNum, txPos, txBytes);
        let state = (await rootchain.getExit.call(priority))[4];
        assert(state == 1, "Exit not in the pending state");

        // fast forward again
        await rootchainHelpers.fastForward();

        // finalize
        let oldBalance = (await rootchain.balanceOf.call(accounts[2])).toNumber();
        let oldChildChainBalance = (await rootchain.childChainBalance()).toNumber();
        await rootchain.finalizeExits({from: authority});

        state = (await rootchain.getExit.call(priority))[4];
        assert(state == 3, "Exit not in the finalized state");

        let balance = (await rootchain.balanceOf.call(accounts[2])).toNumber();
        assert.equal(balance, oldBalance + minExitBond + depositAmount, "Account's rootchain balance was not credited");

        let childChainBalance = (await rootchain.childChainBalance()).toNumber();
        assert.equal(childChainBalance, oldChildChainBalance - minExitBond - depositAmount, "Child chain balance was not updated correctly");

        // send remaining the funds back to the account
        oldChildChainBalance = childChainBalance;
        let oldContractBalance = (await web3.eth.getBalance(rootchain.address)).toNumber();
        await rootchain.withdraw({from: accounts[2]});
        childChainBalance = (await rootchain.childChainBalance.call()).toNumber();
        let contractBalance = (await web3.eth.getBalance(rootchain.address)).toNumber();
        let accountBalance = (await rootchain.balanceOf.call(accounts[2])).toNumber();
        assert.equal(accountBalance, 0, "Account's rootchain balance was not updated");
        assert.equal(contractBalance, oldContractBalance - balance, "Funds not transferred");
        assert.equal(childChainBalance, oldChildChainBalance, "Child chain balance should remain unaffected");
    });

    it("Cannot reopen a finalized exit", async () => {
        let depositAmount = 5000;

        // create a new deposit
        [tx, blockNum, txBytes] = await rootchainHelpers.createAndDepositTX(rootchain, accounts[2], depositAmount);
        let txPos = [blockNum, 0, 0];
        let priority = 1000000000 * blockNum;
        await rootchainHelpers.startExit(rootchain, accounts[2], depositAmount, minExitBond, blockNum, txPos, txBytes);
        let state = (await rootchain.getExit.call(priority))[4];
        assert(state == 1, "Exit not in the pending state");

        await rootchainHelpers.fastForward();
        await rootchain.finalizeExits();
        state = (await rootchain.getExit.call(priority))[4];
        assert(state == 3, "Exit not in the finalized state");

        let [err] = await catchError(rootchainHelpers.startExit(rootchain, accounts[2], depositAmount, minExitBond, blockNum, txPos, txBytes));
        if (!err)
            assert.fail("Reopened a finalized exit");
    });
});
