// external libraries
let RLP = require('rlp');
let assert = require('chai').assert;

let {
    catchError,
    toHex,
    fastForward,
    proofForDepositBlock,
    zeroHashes
} = require('./utilities.js');

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
          computedRoot = web3.sha3(computedRoot + zeroHashes[i],
            {encoding: 'hex'}).slice(2)
        }
        let newBlockNum = await rootchain.currentChildBlock.call()
        await rootchain.submitBlock(toHex(computedRoot));

        // create the right confirm sig
        let confirmHash = web3.sha3(txHash.slice(2) + sigs.slice(2) + computedRoot, {encoding: 'hex'});
        let confirmSignature = await web3.eth.sign(accounts[2], confirmHash);
        let incorrectConfirmSig = await web3.eth.sign(accounts[2], "0x1234");

        // challenge incorrectly
        let err
        [err] = await catchError(rootchain.challengeExit([blockNum, 0, 0], [newBlockNum, 0, 0],
            toHex(txBytes), toHex(proofForDepositBlock),
            toHex(sigs), toHex(incorrectConfirmSig), {from: accounts[3]}));
        if (!err) {
            assert.fail("Successful Challenge with incorrect confirm signature");
        }

        // challenge correctly
        let oldBal = (await rootchain.getBalance.call({from: accounts[3]})).toNumber();
        let result = await rootchain.challengeExit([blockNum, 0, 0], [newBlockNum, 0, 0],
            toHex(txBytes), toHex(proofForDepositBlock),
            toHex(sigs), toHex(confirmSignature), {from: accounts[3]});

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

        // fast forward and finalize any exits from previous tests
        let queueSize = (await rootchain.getExitQueueSize()).toNumber();

        await fastForward();
        let result = await rootchain.finalizeExits(queueSize, {from: authority});

        // Calculate gas used
        // let gasUsed = Number(web3.eth.getTransactionReceipt(result.receipt.transactionHash).gasUsed);
        // console.log(queueSize, gasUsed);

        queueSize = (await rootchain.getExitQueueSize()).toNumber();

        assert.equal(queueSize, 0, "The exits have not been flushed.");

        // start a new exit
        let txPos = [blockNum, 0, 0];

        await rootchainHelpers.startNewExit(rootchain, accounts[2], depositAmount, minExitBond, blockNum, txPos, rest[1], rest[2]);

        // fast forward again
        await fastForward();

        // finalize
        let balance, contractBalance, childChainBalance;
        [balance, contractBalance, childChainBalance]
            = await rootchainHelpers.successfulFinalizeExit(rootchain, accounts[2], authority, blockNum, depositAmount, minExitBond, 1, true);

        // send remaining the funds back to the account
        await rootchainHelpers.successfulWithdraw(rootchain, accounts[2], balance, contractBalance, childChainBalance);
    });

    it("Try to exit with insufficient funds", async () => {

      let depositAmount = 4000;

      let blockNum, rest;
      [blockNum, ...rest] = await rootchainHelpers.createAndDepositTX(rootchain, accounts[2], depositAmount);

      let txPos = [blockNum, 0, 0];

      // fast forward and finalize any exits from previous tests
      let queueSize = (await rootchain.getExitQueueSize()).toNumber();

      await fastForward();
      let result = await rootchain.finalizeExits(queueSize, {from: authority});

      // Calculate gas used
      // let gasUsed = Number(web3.eth.getTransactionReceipt(result.receipt.transactionHash).gasUsed);
      // console.log(queueSize, gasUsed);

      queueSize = (await rootchain.getExitQueueSize()).toNumber();

      assert.equal(queueSize, 0, "The exits have not been flushed.");

      // Drain contract so there are insufficient funds so an exit can fail due to the check amountToAdd > this.balance - totalWithdrawBalance
      let i;
      for (i = 0; i < 3; i++) {

        // start a new exit
        await rootchainHelpers.startNewExit(rootchain, accounts[2], depositAmount, minExitBond, blockNum, txPos, rest[1], rest[2]);

        // fast forward again
        await fastForward();

        // finalize
        let balance, contractBalance, childChainBalance;
        [balance, contractBalance, childChainBalance]
            = await rootchainHelpers.successfulFinalizeExit(rootchain, accounts[2], authority, blockNum, depositAmount, minExitBond, 1, true);
      }

      // start a new exit
      // this should fail since the child chain doesn't have nough to pay it back
      await rootchainHelpers.startNewExit(rootchain, accounts[2], depositAmount, minExitBond, blockNum, txPos, rest[1], rest[2]);

      // fast forward again
      await fastForward();

      // failed finalize
      await rootchainHelpers.successfulFinalizeExit(rootchain, accounts[2], authority, blockNum, depositAmount, minExitBond, 1, false);
    });
});
