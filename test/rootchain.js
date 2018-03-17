let RootChain = artifacts.require("RootChain");
let RLP = require('rlp');

contract('RootChain', async (accounts) => {

    it("Submit block from authority passes", async () => {
        let instance = await RootChain.deployed();
        let curr = parseInt(await instance.currentChildBlock.call());

        // waiting at least 6 root chain blocks before submitting a block
        for (i = 0; i < 5; i++) {
            await web3.eth.sendTransaction({'from': accounts[0], 'to': accounts[1], 'value': 100});
        }

        let blockRoot = '2984748479872';
        await instance.submitBlock(web3.fromAscii(blockRoot));
        let next = parseInt(await instance.currentChildBlock.call());
        assert.equal(curr + 1, next, "Child block did not increment");

        let childBlock = await instance.getChildChain.call(curr);
        assert.equal(web3.toUtf8(childBlock[0]), blockRoot, 'Child block merkle root does not match submitted merkle root.');
    });

    it("Depositing a block passes", async () => {
        let instance = await RootChain.deployed();
        //Why does this work? David's implementation requires txBytes to have length 11
        let depositAmount = 50000;
        let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], depositAmount, 0, 0, 0]);
        let prev =  parseInt(await instance.currentChildBlock.call());

        let result = await instance.deposit(txBytes.toString('binary'), {'from': accounts[2], 'value': depositAmount});
        assert.equal(result.logs[0].args.depositor, accounts[2], 'Deposit event does not match depositor address.');
        assert.equal(parseInt(result.logs[0].args.amount), depositAmount, 'Deposit event does not match deposit amount.');

        let curr = parseInt(await instance.currentChildBlock.call());
        assert.equal(prev + 1, curr, "Child block did not increment");
        // TODO: check correctness of newly created merkle root
    });

    it("Deposit then submit block passes", async () => {
        let instance = await RootChain.deployed();
        let depositAmount = 50000;
        let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], depositAmount, 0, 0, 0]);
        let prevBlockNum = parseInt(await instance.currentChildBlock.call());

        await instance.deposit(txBytes.toString('binary'), {'from': accounts[2], 'value': depositAmount});
        let currBlockNum = parseInt(await instance.currentChildBlock.call());
        assert.equal(prevBlockNum + 1, currBlockNum, "Child block did not increment after Deposit.");

        for (i = 0; i < 5; i++) {
            await web3.eth.sendTransaction({'from': accounts[0], 'to': accounts[1], 'value': 100});
        }

        let blockRoot = '2984748479872';
        await instance.submitBlock(web3.fromAscii(blockRoot));
        let nextBlockNum = parseInt(await instance.currentChildBlock.call());
        assert.equal(currBlockNum + 1, nextBlockNum, "Child block did not increment after submitting a block.")
    });

    it("Invalid deposits fail", async () => {
        let instance = await RootChain.deployed();
        let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
        promiseToThrow(instance.deposit(txBytes.toString('binary'), {'from': accounts[2], 'value': 50}), "Invalid deposit did not revert");

        let txBytes2 = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], 50000, accounts[3], 10000, 0]);
        promiseToThrow(instance.deposit(txBytes2.toString('binary'), {'from': accounts[2], 'value': 50000}), "Invalid deposit did not revert");

        let txBytes3 = RLP.encode([3, 5, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
        promiseToThrow(instance.deposit(txBytes3.toString('binary'), {'from': accounts[2], 'value': 50000}), "Invalid deposit did not revert");
    });

    it("Submit block from someone other than authority fails", async () => {
        let instance = await RootChain.deployed();
        for (i = 0; i < 5; i++) {
            await web3.eth.sendTransaction({'from': accounts[0], 'to': accounts[1], 'value': 100});
        }

        let prev = parseInt(await instance.currentChildBlock.call());
        promiseToThrow(instance.submitBlock('496934090963', {'from': accounts[1]}), "Submit allowed from wrong person");

        let curr = parseInt(await instance.currentChildBlock.call());
        assert.equal(prev, curr, "Allowed submit block from someone other than authority!");
    });

    it("Submit block within 6 rootchain blocks fails", async () => {
        let instance = await RootChain.deployed();
        // First submission waits and passes
        for (i = 0; i < 5; i++) {
            await web3.eth.sendTransaction({'from': accounts[0], 'to': accounts[1], 'value': 100});
        }
        let blockRoot1 = '2984748479872';
        await instance.submitBlock(web3.fromAscii(blockRoot1));

        // Second submission does not wait and therfore fails.
        for (i = 0; i < 3; i++) {
            await web3.eth.sendTransaction({'from': accounts[0], 'to': accounts[1], 'value': 100});
        }
        let blockRoot2 = '8473748479872';
        promiseToThrow(instance.submitBlock(web3.fromAscii(blockRoot2)), "Submit does not wait 6 rootchain blocks.");
    });
});

// Function from Jeremiah Andrews
function promiseToThrow(p, msg) {
    return p.then(_ => false).catch(_ => true).then(res => assert(res, msg));
}
