// let RootChain = artifacts.require("RootChain");
// let RLP = require('rlp');
// let assert = require('chai').assert;
// let to = require('./utilities.js').to;
//
// contract('RootChain', async (accounts) => {
//
//     it("Submit block from authority passes", async () => {
//         let instance = await RootChain.deployed();
//         let curr = parseInt(await instance.currentChildBlock.call());
//
//         // waiting at least 5 root chain blocks before submitting a block
//         for (i = 0; i < 5; i++) {
//             await web3.eth.sendTransaction({'from': accounts[0], 'to': accounts[1], 'value': 100});
//         }
//
//         let blockRoot = '2984748479872';
//         await instance.submitBlock(web3.fromAscii(blockRoot));
//         let next = parseInt(await instance.currentChildBlock.call());
//         assert.equal(curr + 1, next, "Child block did not increment");
//
//         let childBlock = await instance.getChildChain.call(curr);
//         assert.equal(web3.toUtf8(childBlock[0]), blockRoot, 'Child block merkle root does not match submitted merkle root.');
//     });
//
//     it("Depositing a block passes", async () => {
//         let instance = await RootChain.deployed();
//         let depositAmount = 50000;
//         let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], depositAmount, 0, 0, 0]);
//         let validatorBlock = parseInt(await instance.validatorBlocks.call())
//         let prev =  parseInt(await instance.currentChildBlock.call());
//
//         let result = await instance.deposit(validatorBlock, txBytes.toString('binary'), {'from': accounts[2], 'value': depositAmount});
//         assert.equal(result.logs[0].args.depositor, accounts[2], 'Deposit event does not match depositor address.');
//         assert.equal(parseInt(result.logs[0].args.amount), depositAmount, 'Deposit event does not match deposit amount.');
//
//         let curr = parseInt(await instance.currentChildBlock.call());
//
//         assert.equal(prev + 1, curr, "Child block did not increment");
//     });
//
//     it("Deposit then submit block passes", async () => {
//         let instance = await RootChain.deployed();
//         let depositAmount = 50000;
//         let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], depositAmount, 0, 0, 0]);
//         let prevBlockNum = parseInt(await instance.currentChildBlock.call());
//         let validatorBlock = parseInt(await instance.validatorBlocks.call())
//
//         await instance.deposit(validatorBlock, txBytes.toString('binary'), {'from': accounts[2], 'value': depositAmount});
//         let currBlockNum = parseInt(await instance.currentChildBlock.call());
//         assert.equal(prevBlockNum + 1, currBlockNum, "Child block did not increment after Deposit.");
//
//         for (i = 0; i < 5; i++) {
//             await web3.eth.sendTransaction({'from': accounts[0], 'to': accounts[1], 'value': 100});
//         }
//
//         let blockRoot = '2984748479872';
//         await instance.submitBlock(web3.fromAscii(blockRoot));
//         let nextBlockNum = parseInt(await instance.currentChildBlock.call());
//         assert.equal(currBlockNum + 1, nextBlockNum, "Child block did not increment after submitting a block.")
//     });
//
//     it("Invalid deposits fail", async () => {
//         let instance = await RootChain.deployed();
//         let validatorBlock = parseInt(await instance.validatorBlocks.call())
//         let err;
//
//         let txBytes1 = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
//         [err] = await to(instance.deposit(validatorBlock, txBytes1.toString('binary'), {'from': accounts[2], 'value': 50}));
//         if (!err) {
//             assert(false, "Invalid deposit, did not revert");
//         }
//
//         let txBytes2 = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], 50000, accounts[3], 10000, 0]);
//         [err] = await to(instance.deposit(validatorBlock, txBytes2.toString('binary'), {'from': accounts[2], 'value': 50000}));
//         if (!err) {
//             assert(false, "Invalid deposit, did not revert");
//         }
//
//         let txBytes3 = RLP.encode([3, 5, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
//         [err] = await to(instance.deposit(validatorBlock, txBytes3.toString('binary'), {'from': accounts[2], 'value': 50000}));
//         if (!err) {
//             assert(false, "Invalid deposit, did not revert");
//         }
//
//     });
//
//
//     it("Deposit after unseen Submitted Block fails", async () => {
//         let instance = await RootChain.deployed();
//         let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
//         let validatorBlock = parseInt(await instance.validatorBlocks.call())
//
//         for (i = 0; i < 5; i++) {
//             await web3.eth.sendTransaction({'from': accounts[0], 'to': accounts[1], 'value': 100});
//         }
//         await instance.submitBlock('578484785954');
//         let newValidatorBlock = parseInt(await instance.validatorBlocks.call())
//         assert.equal(validatorBlock + 1, newValidatorBlock, "Validator Block doesn't increment")
//
//         let err;
//         [err] = await to(instance.deposit(validatorBlock, txBytes.toString('binary'), {'from': accounts[2], 'value': 50000}))
//
//         if(!err)
//             assert(false, "Allowed deposit to be added after unseen block")
//
//     })
//
//     it("Submit block from someone other than authority fails", async () => {
//         let instance = await RootChain.deployed();
//         for (i = 0; i < 5; i++) {
//             await web3.eth.sendTransaction({'from': accounts[0], 'to': accounts[1], 'value': 100});
//         }
//
//         let prev = parseInt(await instance.currentChildBlock.call());
//
//         let err;
//         [err] = await to(instance.submitBlock('496934090963', {'from': accounts[1]}));
//         if (!err) {
//             assert(false, "Submit allowed from wrong person!"); // this line should never be reached
//         }
//
//         let curr = parseInt(await instance.currentChildBlock.call());
//         assert.equal(prev, curr, "Allowed submit block from someone other than authority!");
//     });
//
//     it("Submit block within 6 rootchain blocks fails", async () => {
//         let instance = await RootChain.deployed();
//         // First submission waits and passes
//         for (i = 0; i < 5; i++) {
//             await web3.eth.sendTransaction({'from': accounts[0], 'to': accounts[1], 'value': 100});
//         }
//         let blockRoot1 = '2984748479872';
//         await instance.submitBlock(web3.fromAscii(blockRoot1));
//
//         // Second submission does not wait and therfore fails.
//         for (i = 0; i < 3; i++) {
//             await web3.eth.sendTransaction({'from': accounts[0], 'to': accounts[1], 'value': 100});
//         }
//         let blockRoot2 = '8473748479872';
//         let err;
//         [err] = await to(instance.submitBlock(web3.fromAscii(blockRoot2)));
//         if (!err) {
//             assert(false, "Submit does not wait 6 rootchain blocks.");
//         }
//     });
// });
