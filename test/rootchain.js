// external libraries
let RLP = require('rlp');
let assert = require('chai').assert;

let { 
    to,
    proofForDepositBlock,
    hexToBinary,
    zeroHashes,
} = require('./utilities.js');

let RootChain = artifacts.require("RootChain");

contract('RootChain', async (accounts) => {
    // one rootchain contract for all tests
    let rootchain;
    before(async () => {
        rootchain = await RootChain.deployed();
    });

    let authority = accounts[0];

    it("Submit block from authority", async () => {
        let curr = parseInt(await rootchain.currentChildBlock.call());
        let currValidatorBlocks = parseInt(await rootchain.validatorBlocks.call());

        // waiting at least 5 root chain blocks before submitting a block
        for (i = 0; i < 5; i++) {
            await web3.eth.sendTransaction({'from': authority, 'to': accounts[1], 'value': 100});
        }

        let blockRoot = '2984748479872';
        await rootchain.submitBlock(web3.fromAscii(blockRoot));
        let next = parseInt(await rootchain.currentChildBlock.call());
        let validatorBlocks = parseInt(await rootchain.validatorBlocks.call());

        assert.equal(curr + 1, next, "Child block did not increment");
        assert.equal(currValidatorBlocks + 1, validatorBlocks, "Validator Blocks did not increment");

        let childBlock = await rootchain.getChildChain.call(curr);
        assert.equal(web3.toUtf8(childBlock[0]), blockRoot, 'Child block merkle root does not match submitted merkle root.');
    });

    it("Depositing a block", async () => {
        let depositAmount = 50000;
        let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], depositAmount, 0, 0, 0]);
        let validatorBlock = parseInt(await rootchain.validatorBlocks.call())
        let prev =  parseInt(await rootchain.currentChildBlock.call());

        let result = await rootchain.deposit(validatorBlock, txBytes.toString('binary'), {'from': accounts[2], 'value': depositAmount});

        assert.equal(result.logs[0].args.depositor, accounts[2], 'Deposit event does not match depositor address.');
        assert.equal(parseInt(result.logs[0].args.amount), depositAmount, 'Deposit event does not match deposit amount.');

        let curr = parseInt(await rootchain.currentChildBlock.call());
        assert.equal(prev + 1, curr, "Child block did not increment");
    });

    it("Deposit then submit block", async () => {
        let depositAmount = 50000;
        let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], depositAmount, 0, 0, 0]);
        let prevBlockNum = parseInt(await rootchain.currentChildBlock.call());
        let validatorBlock = parseInt(await rootchain.validatorBlocks.call());

        await rootchain.deposit(validatorBlock, txBytes.toString('binary'), {'from': accounts[2], 'value': depositAmount});
        let currBlockNum = parseInt(await rootchain.currentChildBlock.call());

        assert.equal(prevBlockNum + 1, currBlockNum, "Child block did not increment after Deposit.");

        for (i = 0; i < 5; i++) {
            await web3.eth.sendTransaction({'from': authority, 'to': accounts[1], 'value': 100});
        }

        let blockRoot = '2984748479872';
        await rootchain.submitBlock(web3.fromAscii(blockRoot));
        let nextBlockNum = parseInt(await rootchain.currentChildBlock.call());
        assert.equal(currBlockNum + 1, nextBlockNum, "Child block did not increment after submitting a block.");
    });

    it("Invalid deposits", async () => {
        let validatorBlock = parseInt(await rootchain.validatorBlocks.call())
        let err;

        let txBytes1 = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
        [err] = await to(rootchain.deposit(validatorBlock, txBytes1.toString('binary'), {'from': accounts[2], 'value': 50}));
        if (!err) {
            assert.fail("Invalid deposit, did not revert");
        }

        let txBytes2 = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], 50000, accounts[3], 10000, 0]);
        [err] = await to(rootchain.deposit(validatorBlock, txBytes2.toString('binary'), {'from': accounts[2], 'value': 50000}));
        if (!err) {
            assert.fail("Invalid deposit, did not revert");
        }

        let txBytes3 = RLP.encode([3, 5, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
        [err] = await to(rootchain.deposit(validatorBlock, txBytes3.toString('binary'), {'from': accounts[2], 'value': 50000}));
        if (!err) {
            assert.fail("Invalid deposit, did not revert");
        }

    });

    it("Deposit after unseen submitted block", async () => {
        let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
        let validatorBlock = parseInt(await rootchain.validatorBlocks.call())

        for (i = 0; i < 5; i++) {
            await web3.eth.sendTransaction({'from': authority, 'to': accounts[1], 'value': 100});
        }
        await rootchain.submitBlock('578484785954');
        let newValidatorBlock = parseInt(await rootchain.validatorBlocks.call())
        assert.equal(validatorBlock + 1, newValidatorBlock, "Validator Block doesn't increment")

        let err;
        [err] = await to(rootchain.deposit(validatorBlock, txBytes.toString('binary'), {'from': accounts[2], 'value': 50000}))

        if(!err)
            assert.fail("Allowed deposit to be added after unseen block")

    });

    it("Submit block from someone other than authority", async () => {
        for (i = 0; i < 5; i++) {
            await web3.eth.sendTransaction({'from': authority, 'to': accounts[1], 'value': 100});
        }

        let prev = parseInt(await rootchain.currentChildBlock.call());

        let err;
        [err] = await to(rootchain.submitBlock('496934090963', {'from': accounts[1]}));
        if (!err) {
            assert.fail("Submit allowed from wrong person!"); // this line should never be reached
        }

        let curr = parseInt(await rootchain.currentChildBlock.call());
        assert.equal(prev, curr, "Allowed submit block from someone other than authority!");
    });

    it("Submit block within 6 rootchain blocks", async () => {
        // First submission waits and passes
        for (i = 0; i < 5; i++) {
            await web3.eth.sendTransaction({'from': authority, 'to': accounts[1], 'value': 100});
        }
        let blockRoot1 = '2984748479872';
        await rootchain.submitBlock(web3.fromAscii(blockRoot1));

        // Second submission does not wait and therfore fails.
        for (i = 0; i < 3; i++) {
            await web3.eth.sendTransaction({'from': authority, 'to': accounts[1], 'value': 100});
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
        let blockNum = await rootchain.currentChildBlock.call();
        let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], 5000, 0, 0, 0]);
        let validatorBlock = await rootchain.validatorBlocks.call();
        await rootchain.deposit(validatorBlock, txBytes.toString('binary'), {'from': accounts[2], 'value': 5000});

        // construct the confirm sig
        // Remove all 0x prefixes from hex strings
        let blockHeader = (await rootchain.getChildChain(blockNum))[0];
        let txHash = web3.sha3(txBytes.toString('hex'), {encoding: 'hex'});
        let sigs = (new Buffer(130)).toString('hex');

        // create the confirm sig
        let confirmHash = web3.sha3(txHash.slice(2) + sigs + blockHeader.slice(2), {encoding: 'hex'});
        let confirmSignature = web3.eth.sign(accounts[2], confirmHash);

        // start the exit
        let txPos = [blockNum, 0, 0];
        let exitSigs = new Buffer(130).toString('hex') + confirmSignature.slice(2) + new Buffer(65).toString('hex');

        await rootchain.startExit(txPos, txBytes.toString('binary'), 
            hexToBinary(proofForDepositBlock), hexToBinary(exitSigs), {'from': accounts[2], 'value': 10000 });

        let priority = 1000000000*blockNum;
        let exit = await rootchain.getExit.call(priority);
        assert(exit[0] == accounts[2], "Incorrect exit owner");
        assert(exit[1].toNumber() == 5000, "Incorrect amount");
        assert(exit[2][0].toNumber() == blockNum, "Incorrect block number");
    });

    it("Challenge the above exit with the incorrect confirm sig", async () => {
        let txBytes = RLP.encode([6, 0, 0, 0, 0, 0, accounts[3], 5000, 0, 0, 0]);
        let txHash = web3.sha3(txBytes.toString('hex'), {encoding: 'hex'});
        let sigs = web3.eth.sign(accounts[2], txHash);
        sigs += new Buffer(65).toString('hex');

        let confirmSignature = web3.eth.sign(accounts[2], "INCORRECTCONFIRMSIGMUAHAHAHAHAHAHAHA-HamdiWasHere");

        let err;
        [err] = await to(rootchain.challengeExit([7, 0, 0], [8, 0, 0],
            txBytes.toString('binary'), hexToBinary(proofForDepositBlock),
            hexToBinary(sigs), hexToBinary(confirmSignature), {'from': accounts[3]}));

        if (!err) {
            assert.fail('Invalid start exit allowed');
        }
    });

    it("Challenge with correct confirmSignature", async () => {
        // transact accounts[2] => accounts[3]. DOUBLE SPEND (earlier exit)
        let txBytes = RLP.encode([7, 0, 0, 0, 0, 0, accounts[3], 5000, 0, 0, 0]);
        let txHash = web3.sha3(txBytes.toString('hex'), {encoding: 'hex'});
        let sigs = web3.eth.sign(accounts[2], txHash);
        sigs += new Buffer(65).toString('hex');
        let leaf = web3.sha3(txHash.slice(2) + sigs.slice(2), {encoding: 'hex'});

        // create the block and submit as an authority
        let computedRoot = leaf.slice(2);
        for (let i = 0; i < 16; i++) {
          computedRoot = web3.sha3(computedRoot + zeroHashes[i], 
            {encoding: 'hex'}).slice(2)
        }
        await rootchain.submitBlock(hexToBinary(computedRoot));

        // create the right confirm sig
        let confirmHash = web3.sha3(txHash.slice(2) + sigs.slice(2) + computedRoot, {encoding: 'hex'});
        let confirmSignature = web3.eth.sign(accounts[2], confirmHash);

        let balance = (await rootchain.getBalance.call({'from': accounts[3]})).toNumber();
        assert(balance === 0, "Account balance on rootchain is not zero");
        // challenge
        await rootchain.challengeExit([7, 0, 0], [8, 0, 0],
            txBytes.toString('binary'), hexToBinary(proofForDepositBlock),
            hexToBinary(sigs), hexToBinary(confirmSignature), {'from': accounts[3]});

        balance = (await rootchain.getBalance.call({'from': accounts[3]})).toNumber();
        assert(balance == 10000, "Challenge bounty was not dispursed");

        let priority = 6000000000;
        let exit = await rootchain.getExit.call(priority);
        // make sure the exit was deleted
        assert(exit[0] == 0, "Incorrect exit owner");
    });

    it("Withdraw from the above successfull challenge", async () => {
        let bal = web3.eth.getBalance(accounts[3]).toNumber();
        let tx = (await rootchain.withdraw({'from': accounts[3]})).tx;
        let gasUsed = web3.eth.getTransactionReceipt(tx).gasUsed;
        let price = web3.eth.getTransaction(tx).gasPrice;
        let amt = price * gasUsed;

        let expectedBal = bal + 10000 - amt;
        let currBal = web3.eth.getBalance(accounts[3]).toNumber();

        assert(currBal == expectedBal, "Account was not accreddited"); 
    });

    it("Start exit and finalize after a week", async () => {
        // submit a deposit
        let blockNum = await rootchain.currentChildBlock.call();
        let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], 5000, 0, 0, 0]);
        let validatorBlock = await rootchain.validatorBlocks.call();
        await rootchain.deposit(validatorBlock, txBytes.toString('binary'), {'from': accounts[2], 'value': 5000});

        // construct the confirm sig
        // Remove all 0x prefixes from hex strings
        let blockHeader = (await rootchain.getChildChain(blockNum))[0];
        let txHash = web3.sha3(txBytes.toString('hex'), {encoding: 'hex'});
        let sigs = (new Buffer(130)).toString('hex');

        // create the confirm sig
        let confirmHash = web3.sha3(txHash.slice(2) + sigs + blockHeader.slice(2), {encoding: 'hex'});
        let confirmSignature = web3.eth.sign(accounts[2], confirmHash);

        // start the exit
        let txPos = [blockNum, 0, 0];
        let exitSigs = new Buffer(130).toString('hex') + confirmSignature.slice(2) + new Buffer(65).toString('hex');

        await rootchain.startExit(txPos, txBytes.toString('binary'), 
            hexToBinary(proofForDepositBlock), hexToBinary(exitSigs), {'from': accounts[2], 'value': 10000 });

        // fast forward the next block 1 week
        let oldTime = web3.eth.getBlock(web3.eth.blockNumber).timestamp
        // a bit over a week
        await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [804800], id: 0})
        await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0})


        let currTime = web3.eth.getBlock(web3.eth.blockNumber).timestamp

        // allow for some error up 3 secs from increasing time to mining the next block
        let diff = (currTime - oldTime) - 804800
        assert(diff < 3, "Block time was not fast forwarded by 1 week");

        let bal = (await rootchain.getBalance.call({'from': accounts[2]})).toNumber();
        assert(bal == 0, "Account balance on rootchain is not zero");

        // accounts[0] will eat up the gas cost
        await rootchain.finalizeExits({'from': accounts[0]});
        bal = (await rootchain.getBalance.call({'from': accounts[2]})).toNumber();
        assert(bal == (10000 + 5000), "Account's rootchain balance was not credited");

        let priority = blockNum * 1000000000;
        let exit = await rootchain.getExit.call(priority);
        // make sure the exit was deleted
        assert(exit[0] == 0, "Incorrect exit owner");
    });

    it("Start an invalid exit", async () => {
        // submit a deposit
        let blockNum = await rootchain.currentChildBlock.call();
        let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], 5000, 0, 0, 0]);
        let validatorBlock = await rootchain.validatorBlocks.call();
        await rootchain.deposit(validatorBlock, txBytes.toString('binary'), {'from': accounts[2], 'value': 5000});

        // construct the confirm sig
        // Remove all 0x prefixes from hex strings
        let blockHeader = (await rootchain.getChildChain(blockNum))[0];
        let txHash = web3.sha3(txBytes.toString('hex'), {encoding: 'hex'});
        let sigs = (new Buffer(130)).toString('hex');
        let leaf = web3.sha3(txHash + sigs, {encoding: 'hex'});

        // create the confirm sig
        let confirmHash = web3.sha3(txHash.slice(2) + sigs + blockHeader.slice(2), {encoding: 'hex'});
        let confirmSignature = web3.eth.sign(accounts[2], confirmHash);

        // start the exit
        let txPos = [blockNum, 0, 0];
        let exitSigs = new Buffer(130).toString('hex') + confirmSignature.slice(2) + new Buffer(65).toString('hex');

        let err
        [err] = await to(rootchain.startExit.call(txPos, txBytes.toString('binary'), 
            hexToBinary(proofForDepositBlock), hexToBinary(exitSigs), {'from': accounts[3], 'value': 10000 })); // incorrect account
        if (!err) {
            assert.fail("Invalid exit started");
        }
    });
});
