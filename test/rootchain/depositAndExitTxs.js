// external libraries
let RLP = require('rlp');
let assert = require('chai').assert;

let {
    catchError,
    toHex,
    fastForward,
    proofForDepositBlock,
    zeroHashes
} = require('../utilities.js');

let rootchainHelpers = require('./rootchain_helpers.js');

let RootChain = artifacts.require("RootChain");

/*
 * Alot of the tests contain duplicated transactions
 * submitted to the rootchain to avoid wierd effects
 *
 */

contract('Deposit and Exit Transactions', async (accounts) => {
    // one rootchain contract for all tests
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
        let blockNum, rest;
        [blockNum, ...rest] = await rootchainHelpers.createAndDepositTX(rootchain, accounts[2], depositAmount);

        // start the exit
        let txPos = [blockNum, 0, 0];
        let txBytes = rest[0];

        await rootchainHelpers.startNewExit(rootchain, accounts[2], depositAmount, minExitBond, blockNum, txPos, txBytes);
    });

    it("Try to exit with invalid parameters", async () => {
        // submit a deposit
        let blockNum, rest;
        [blockNum, ...rest] = await rootchainHelpers.createAndDepositTX(rootchain, accounts[2], 5000);

        // start the exit
        let txPos = [blockNum, 0, 0];
        let txBytes = rest[0];

        // Invalid owner started the exit
        await rootchainHelpers.startFailedExit(rootchain, accounts[3], 10000, minExitBond, blockNum, txPos, txBytes);

        // Exit started with insufficient bond
        await rootchainHelpers.startFailedExit(rootchain, accounts[2], 10, minExitBond, blockNum, txPos, txBytes);
    });

    it("Start exit, finalize after a week, and withdraw", async () => {
        let depositAmount = 5000;

        // create a new deposit
        let blockNum, rest;
        [blockNum, ...rest] = await rootchainHelpers.createAndDepositTX(rootchain, accounts[2], depositAmount);

        /*
         * authority will eat up the gas cost in the finalize exit
         * TODO: finalizeExit implementation needs to be changed to prevent a
         * revert from occuring if gas runs out
         */

        // fast forward and finalize any exits from previous tests
        await fastForward();
        await rootchain.finalizeExits({from: authority});

        // start a new exit
        let txPos = [blockNum, 0, 0];
        let txBytes = rest[0];
        await rootchainHelpers.startNewExit(rootchain, accounts[2], depositAmount, minExitBond, blockNum, txPos, txBytes);

        // fast forward again
        await fastForward();

        // finalize
        let balance, contractBalance, childChainBalance;
        [balance, contractBalance, childChainBalance]
            = await rootchainHelpers.successfulFinalizeExit(rootchain, accounts[2], authority, blockNum, depositAmount, minExitBond, true);

        // send remaining the funds back to the account
        await rootchainHelpers.successfulWithdraw(rootchain, accounts[2], balance, contractBalance, childChainBalance);
    });
});
