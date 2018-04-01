// external libraries
let RLP = require('rlp');
let assert = require('chai').assert;

let { 
    to,
    proofForDepositBlock,
    hexToBinary
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
        let leaf = web3.sha3(txHash + sigs, {encoding: 'hex'});

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
        assert(exit[2][0].toNumber() == blockNum , "Incorrect block number");
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
        [err] = await to(rootchain.startExit(txPos, txBytes.toString('binary'), 
            hexToBinary(proofForDepositBlock), hexToBinary(exitSigs), {'from': accounts[3], 'value': 10000 }));
        if (!err) {
            assert.fail("Invalid exit started");
        }
    });
});
