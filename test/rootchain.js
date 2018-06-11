// external libraries
let RLP = require('rlp');
let assert = require('chai').assert;

let {
    to,
    toHex,
    createAndDepositTX,
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
        for (i = 0; i < 5; i++) {
            await web3.eth.sendTransaction({from: authority, 'to': accounts[1], value: 100});
        }

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

        for (i = 0; i < 5; i++) {
            await web3.eth.sendTransaction({from: authority, 'to': accounts[1], value: 100});
        }

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

        for (i = 0; i < 5; i++) {
            await web3.eth.sendTransaction({from: authority, 'to': accounts[1], value: 100});
        }
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
        for (i = 0; i < 5; i++) {
            await web3.eth.sendTransaction({from: authority, 'to': accounts[1], value: 100});
        }

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
        for (i = 0; i < 5; i++) {
            await web3.eth.sendTransaction({from: authority, 'to': accounts[1], value: 100});
        }
        let blockRoot1 = '2984748479872';
        await rootchain.submitBlock(web3.fromAscii(blockRoot1));

        // Second submission does not wait and therfore fails.
        for (i = 0; i < 3; i++) {
            await web3.eth.sendTransaction({from: authority, 'to': accounts[1], value: 100});
        }
        let blockRoot2 = '8473748479872';
        let err;
        [err] = await to(rootchain.submitBlock(web3.fromAscii(blockRoot2)));
        if (!err) {
            assert.fail("Submit does not wait 6 rootchain blocks.");
        }
    });

    it("Start an exit", async () => {
        // submit a deposit
        let blockNum, confirmHash, confirmSignature, txBytes, txHash, sigs, blockHeader;
        [blockNum, confirmHash, confirmSignature,
            txBytes, txHash, sigs, blockHeader] = await createAndDepositTX(rootchain, accounts[2], 5000);

        // start the exit
        let txPos = [blockNum, 0, 0];
        let exitSigs = Buffer.alloc(130).toString('hex') + confirmSignature.slice(2) + Buffer.alloc(65).toString('hex');

        await rootchain.startExit(txPos, toHex(txBytes),
            toHex(proofForDepositBlock), toHex(exitSigs), {from: accounts[2], value: minExitBond });

        let priority = 1000000000*blockNum;
        let exit = await rootchain.getExit.call(priority);
        assert.equal(exit[0], accounts[2], "Incorrect exit owner");
        assert.equal(exit[1], 5000, "Incorrect amount");
        assert.equal(exit[2][0], blockNum, "Incorrect block number");
    });

    it("Try to exit with invalid parameters", async () => {
        // submit a deposit
        let blockNum, confirmHash, confirmSignature, txBytes, txHash, sigs, blockHeader;
        [blockNum, confirmHash, confirmSignature,
            txBytes, txHash, sigs, blockHeader] = await createAndDepositTX(rootchain, accounts[2], 5000);

        // start the exit
        let txPos = [blockNum, 0, 0];
        let exitSigs = Buffer.alloc(130).toString('hex') + confirmSignature.slice(2) + Buffer.alloc(65).toString('hex');

        let err;
        [err] = await to(rootchain.startExit(txPos, toHex(txBytes),
            toHex(proofForDepositBlock), toHex(exitSigs), {from: accounts[3], value: 10000 }));
        if (!err) {
            assert.fail("Invalid owner started the exit");
        }

        [err] = await to(rootchain.startExit(txPos, toHex(txBytes),
            toHex(proofForDepositBlock), toHex(exitSigs), {from: accounts[2], value: 10 }));
        if (!err) {
            assert.fail("Exit started with insufficient bond");
        }
    });

    it("Challenge an exit with a correct/incorrect confirm sigs", async () => {
        let blockNum, rest;
        [blockNum, ...rest] = await createAndDepositTX(rootchain, accounts[2], 5000);

        // exit this transaction
        let exitSigs = Buffer.alloc(130).toString('hex') + rest[1].slice(2) + Buffer.alloc(65).toString('hex');
        await rootchain.startExit([blockNum, 0, 0], toHex(rest[2]),
            toHex(proofForDepositBlock), toHex(exitSigs), {from: accounts[2], value: minExitBond });

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
        [err] = await to(rootchain.challengeExit([blockNum, 0, 0], [newBlockNum, 0, 0],
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
        let blockNum, rest;
        [blockNum, ...rest] = await createAndDepositTX(rootchain, accounts[2], 5000);

        /*
         * authority will eat up the gas cost in the finalize exit
         * TODO: finalizeExit implementation needs to be changed to prevent a
         * revert from occuring if gas runs out
         */

        // fast forward and finalize any exits from previous tests
        await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [804800], id: 0});
        await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0});
        await rootchain.finalizeExits({from: authority});

        // start a new exit
        let exitSigs = Buffer.alloc(130).toString('hex') + rest[1].slice(2) + Buffer.alloc(65).toString('hex');
        await rootchain.startExit([blockNum, 0, 0], toHex(rest[2]),
            toHex(proofForDepositBlock), toHex(exitSigs), {from: accounts[2], value: minExitBond });
        let priority = 1000000000*blockNum;
        let exit = await rootchain.getExit.call(priority);
        assert.equal(exit[0], accounts[2], "Incorrect exit owner");
        assert.equal(exit[1], 5000, "Incorrect amount");
        assert.equal(exit[2][0], blockNum, "Incorrect block number");

        // fast forward again
        let oldTime = (await web3.eth.getBlock(await web3.eth.blockNumber)).timestamp;
        await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [804800], id: 0});
        await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0});
        let currTime = (await web3.eth.getBlock(await web3.eth.blockNumber)).timestamp;
        let diff = (currTime - oldTime) - 804800;
        assert.isBelow(diff, 3, "Block time was not fast forwarded by 1 week"); // 3 sec error for mining the next block

        // finalize
        let oldBal = (await rootchain.getBalance.call({from: accounts[2]})).toNumber();
        let oldChildChainBalance = (await rootchain.childChainBalance()).toNumber();
        await rootchain.finalizeExits({from: authority});

        // check that the is successfully removed from the PQ
        exit = await rootchain.getExit.call(priority);
        assert.equal(exit[0], 0, "Exit was not deleted after finalizing");

        // check that the correct amount has been deposited into the account's balance
        let balance = (await rootchain.getBalance.call({from: accounts[2]})).toNumber();
        assert.equal(balance, oldBal + minExitBond + 5000, "Account's rootchain balance was not credited");

        // check that the child chain balance has been updated correctly
        let contractBalance = (await web3.eth.getBalance(rootchain.address)).toNumber();
        let childChainBalance = (await rootchain.childChainBalance()).toNumber();
        assert.equal(childChainBalance, oldChildChainBalance - minExitBond - 5000, "Child chain balance was not updated correctly");

        // send remaining the funds back to the account
        await rootchain.withdraw({from: accounts[2]});
        let finalBalance = (await rootchain.getBalance.call({from: accounts[2]})).toNumber();
        // check that the balance is now 0 since the funds have been sent
        assert.equal(finalBalance, 0, "Balance was not updated");

        // check that the funds have been transfered
        let finalContractBalance = (await web3.eth.getBalance(rootchain.address)).toNumber();
        assert.equal(finalContractBalance, contractBalance - balance, "Funds were not transfered");

        // check that the child chain balance is not affected
        let finalChildChainBalance = (await rootchain.childChainBalance()).toNumber();
        assert.equal(finalChildChainBalance, childChainBalance, "totalWithdrawBalance was not updated correctly");
    });

    it("Try to exit with insufficient funds", async () => {

      let blockNum, rest;
      [blockNum, ...rest] = await createAndDepositTX(rootchain, accounts[2], 50000);

      /*
       * authority will eat up the gas cost in the finalize exit
       * TODO: finalizeExit implementation needs to be changed to prevent a
       * revert from occuring if gas runs out
       */

      // fast forward and finalize any exits from previous tests
      await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [804800], id: 0});
      await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0});
      await rootchain.finalizeExits({from: authority});

      let exitSigs = Buffer.alloc(130).toString('hex') + rest[1].slice(2) + Buffer.alloc(65).toString('hex');

      // Drain contract so there are insufficient funds so an exit can fail due to the check amountToAdd > this.balance - totalWithdrawBalance
      let i;
      for (i = 0; i < 3; i++) {
        // start a new exit
        await rootchain.startExit([blockNum, 0, 0], toHex(rest[2]),
            toHex(proofForDepositBlock), toHex(exitSigs), {from: accounts[2], value: minExitBond });
        let priority = 1000000000*blockNum;
        let exit = await rootchain.getExit.call(priority);
        assert.equal(exit[0], accounts[2], "Incorrect exit owner");
        assert.equal(exit[1], 50000, "Incorrect amount");
        assert.equal(exit[2][0], blockNum, "Incorrect block number");

        // fast forward again
        let oldTime = (await web3.eth.getBlock(await web3.eth.blockNumber)).timestamp;
        await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [804800], id: 0});
        await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0});
        let currTime = (await web3.eth.getBlock(await web3.eth.blockNumber)).timestamp;
        let diff = (currTime - oldTime) - 804800;
        assert.isBelow(diff, 3, "Block time was not fast forwarded by 1 week"); // 3 sec error for mining the next block

        // finalize
        let oldBal = (await rootchain.getBalance.call({from: accounts[2]})).toNumber();
        let oldChildChainBalance = (await rootchain.childChainBalance()).toNumber();
        await rootchain.finalizeExits({from: authority});

        let balance = (await rootchain.getBalance.call({from: accounts[2]})).toNumber();

        // check that the is successfully removed from the PQ
        exit = await rootchain.getExit.call(priority);
        assert.equal(exit[0], 0, "Exit was not deleted after finalizing");

        // check that the correct amount has been deposited into the account's balance
        assert.equal(balance, oldBal + minExitBond + 50000, "Account's rootchain balance was not credited");

        // check that the child chain balance has been updated correctly
        let contractBalance = (await web3.eth.getBalance(rootchain.address)).toNumber();
        let childChainBalance = (await rootchain.childChainBalance()).toNumber();
        assert.equal(childChainBalance, oldChildChainBalance - minExitBond - 50000, "Child chain balance was not updated correctly");
      }

      // start a new exit
      // this should fail since the child chain doesn't have nough to pay it back
      await rootchain.startExit([blockNum, 0, 0], toHex(rest[2]),
          toHex(proofForDepositBlock), toHex(exitSigs), {from: accounts[2], value: minExitBond });
      let priority = 1000000000*blockNum;
      let exit = await rootchain.getExit.call(priority);
      assert.equal(exit[0], accounts[2], "Incorrect exit owner");
      assert.equal(exit[1], 50000, "Incorrect amount");
      assert.equal(exit[2][0], blockNum, "Incorrect block number");

      // fast forward again
      let oldTime = (await web3.eth.getBlock(await web3.eth.blockNumber)).timestamp;
      await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [804800], id: 0});
      await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0});
      let currTime = (await web3.eth.getBlock(await web3.eth.blockNumber)).timestamp;
      let diff = (currTime - oldTime) - 804800;
      assert.isBelow(diff, 3, "Block time was not fast forwarded by 1 week"); // 3 sec error for mining the next block

      // finalize
      let oldBal = (await rootchain.getBalance.call({from: accounts[2]})).toNumber();
      let oldChildChainBalance = (await rootchain.childChainBalance()).toNumber();
      await rootchain.finalizeExits({from: authority});

      let balance = (await rootchain.getBalance.call({from: accounts[2]})).toNumber();

      // check that the is successfully removed from the PQ
      exit = await rootchain.getExit.call(priority);
      assert.notEqual(exit[0], 0, "Exit should not have been was processed");

      // check that nothing has been deposited into the account's balance
      assert.equal(balance, oldBal, "Account's rootchain balance should stay the same");

      // check that the child chain balance has not changed
      let contractBalance = (await web3.eth.getBalance(rootchain.address)).toNumber();
      let childChainBalance = (await rootchain.childChainBalance()).toNumber();
      assert.equal(childChainBalance, oldChildChainBalance, "Child chain balance should stay the same");
    });
});
