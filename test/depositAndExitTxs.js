// external libraries
let RLP = require('rlp');
let assert = require('chai').assert;

let utilities = require('./utilities.js');
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

        await rootchainHelpers.startNewExit(rootchain, accounts[2], depositAmount, minExitBond, blockNum, txPos, rest[1], rest[2]);
    });

    it("Try to exit with invalid parameters", async () => {
        // submit a deposit
        let blockNum, rest;
        [blockNum, ...rest] = await rootchainHelpers.createAndDepositTX(rootchain, accounts[2], 5000);

        // start the exit
        let txPos = [blockNum, 0, 0];

        // Invalid owner started the exit
        await rootchainHelpers.startFailedExit(rootchain, accounts[3], 10000, minExitBond, blockNum, txPos, rest[1], rest[2]);

        // Exit started with insufficient bond
        await rootchainHelpers.startFailedExit(rootchain, accounts[2], 10, minExitBond, blockNum, txPos, rest[1], rest[2]);
    });

    it("Challenge an exit with a correct/incorrect confirm sigs", async () => {
        let depositAmount = 5000;

        // submit a deposit
        let blockNum, rest;
        [blockNum, ...rest] = await rootchainHelpers.createAndDepositTX(rootchain, accounts[2], depositAmount);

        // start the exit
        let txPos = [blockNum, 0, 0];

        await rootchainHelpers.startNewExit(rootchain, accounts[2], depositAmount, minExitBond, blockNum, txPos, rest[1], rest[2]);

        // transact accounts[2] => accounts[3]. DOUBLE SPEND (earlier exit)
        let txBytes = RLP.encode([blockNum, 0, 0, 5000, 0, 0, 0, 0, 0, 0, accounts[3], 5000, 0, 0, 0]);
        let txHash = web3.sha3(txBytes.toString('hex'), {encoding: 'hex'});
        let sigs = await web3.eth.sign(accounts[2], txHash);
        sigs += Buffer.alloc(65).toString('hex');
        let leaf = web3.sha3(txHash.slice(2) + sigs.slice(2), {encoding: 'hex'});

        // create the block and submit as an authority
        let computedRoot = leaf.slice(2);
        for (let i = 0; i < 16; i++) {
          computedRoot = web3.sha3(computedRoot + utilities.zeroHashes[i],
            {encoding: 'hex'}).slice(2)
        }
        let newBlockNum = await rootchain.currentChildBlock.call()
        await rootchain.submitBlock(utilities.toHex(computedRoot));

        // create the right confirm sig
        let confirmHash = web3.sha3(txHash.slice(2) + sigs.slice(2) + computedRoot, {encoding: 'hex'});
        let confirmSignature = await web3.eth.sign(accounts[2], confirmHash);
        let incorrectConfirmSig = await web3.eth.sign(accounts[2], "0x1234");

        // challenge incorrectly
        let err
        [err] = await utilities.to(rootchain.challengeExit([blockNum, 0, 0], [newBlockNum, 0, 0],
            utilities.toHex(txBytes), utilities.toHex(utilities.proofForDepositBlock),
            utilities.toHex(sigs), utilities.toHex(incorrectConfirmSig), {from: accounts[3]}));
        if (!err) {
            assert.fail("Successful Challenge with incorrect confirm signature");
        }

        // challenge correctly
        let oldBal = (await rootchain.getBalance.call({from: accounts[3]})).toNumber();
        let result = await rootchain.challengeExit([blockNum, 0, 0], [newBlockNum, 0, 0],
            utilities.toHex(txBytes), utilities.toHex(utilities.proofForDepositBlock),
            utilities.toHex(sigs), utilities.toHex(confirmSignature), {from: accounts[3]});

        balance = (await rootchain.getBalance.call({from: accounts[3]})).toNumber();
        assert.equal(balance, oldBal + minExitBond, "Challenge bounty was not dispursed");

        let priority = 1000000000*blockNum;
        let exit = await rootchain.getExit.call(priority);
        // make sure the exit was deleted
        assert.equal(exit[0], 0, "Exit was not deleted after successful challenge");
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
        await utilities.fastForward();
        await rootchain.finalizeExits({from: authority});

        // start a new exit
        let txPos = [blockNum, 0, 0];

        await rootchainHelpers.startNewExit(rootchain, accounts[2], depositAmount, minExitBond, blockNum, txPos, rest[1], rest[2]);

        // fast forward again
        await utilities.fastForward();

        // finalize
        let balance, contractBalance, childChainBalance;
        [balance, contractBalance, childChainBalance]
            = await rootchainHelpers.successfulFinalizeExit(rootchain, accounts[2], authority, blockNum, depositAmount, minExitBond, true);

        // send remaining the funds back to the account
        await rootchainHelpers.successfulWithdraw(rootchain, accounts[2], balance, contractBalance, childChainBalance);
    });

    it("Try to exit with insufficient funds", async () => {

      let depositAmount = 4000;

      let blockNum, rest;
      [blockNum, ...rest] = await rootchainHelpers.createAndDepositTX(rootchain, accounts[2], depositAmount);

      let txPos = [blockNum, 0, 0];

      /*
       * authority will eat up the gas cost in the finalize exit
       * TODO: finalizeExit implementation needs to be changed to prevent a
       * revert from occuring if gas runs out
       */

      // fast forward and finalize any exits from previous tests
      await utilities.fastForward();
      await rootchain.finalizeExits({from: authority});

      // Drain contract so there are insufficient funds so an exit can fail due to the check amountToAdd > this.balance - totalWithdrawBalance
      let i;
      for (i = 0; i < 3; i++) {

        // start a new exit
        await rootchainHelpers.startNewExit(rootchain, accounts[2], depositAmount, minExitBond, blockNum, txPos, rest[1], rest[2]);

        // fast forward again
        await utilities.fastForward();

        // finalize
        let balance, contractBalance, childChainBalance;
        [balance, contractBalance, childChainBalance]
            = await rootchainHelpers.successfulFinalizeExit(rootchain, accounts[2], authority, blockNum, depositAmount, minExitBond, true);
      }

      // start a new exit
      // this should fail since the child chain doesn't have nough to pay it back
      await rootchainHelpers.startNewExit(rootchain, accounts[2], depositAmount, minExitBond, blockNum, txPos, rest[1], rest[2]);

      // fast forward again
      await utilities.fastForward();

      // failed finalize
      await rootchainHelpers.successfulFinalizeExit(rootchain, accounts[2], authority, blockNum, depositAmount, minExitBond, false);
    });
});
