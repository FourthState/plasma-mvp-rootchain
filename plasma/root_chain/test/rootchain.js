var RootChain = artifacts.require("RootChain");
var RLP = require('rlp');

contract('RootChain', accounts => {
    it("Submit block from authority passes", () => {
        return RootChain.deployed().then(async (instance) => {
            var curr = await instance.currentChildBlock.call().then(x => {return parseInt(x)})
            for (i = 0; i < 5; i++) {
                await web3.eth.sendTransaction({'from': accounts[0], 'to': accounts[1], 'value': 100});
            }
            await instance.submitBlock('2984748479872');
            var next = await instance.currentChildBlock.call().then(y => {return parseInt(y)})
            assert.equal(curr + 1, next, "Child block did not increment");
        });
    });
    it("Depositing a block", () => {
        return RootChain.deployed().then(async (instance) => {
            //Why does this work? David's implementation requires txBytes to have length 11
            var txBytes = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
            var prev =  await instance.currentChildBlock.call().then(x => {return parseInt(x)})
            await instance.deposit(txBytes.toString('binary'), {'from': accounts[2], 'value': 50000});
            var curr = await instance.currentChildBlock.call().then(x => {return parseInt(x)})
            assert.equal(prev + 1, curr, "Child block did not increment")
        });
    });
    it("Invalid deposits fail", () => {
        return RootChain.deployed().then(async (instance) => {
            var txBytes = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
            promiseToThrow(instance.deposit(txBytes.toString('binary'), {'from': accounts[2], 'value': 50}), "Invalid deposit did not revert")
        })
    })
    it("Submit block from someone other than authority fails", () => {
        RootChain.deployed().then(async (instance) => {
            for (i = 0; i < 5; i++) {
                await web3.eth.sendTransaction({'from': accounts[0], 'to': accounts[1], 'value': 100});
            }
            var prev = await instance.currentChildBlock.call().then(x => {return parseInt(x)})
            promiseToThrow(instance.submitBlock('496934090963', {'from': accounts[1]}), "Submit allowed from wrong person");
            var curr = await instance.currentChildBlock.call().then(x => {return parseInt(x)})
            assert.equal(prev, curr, "Allowed submit block from someone other than authority!");
        });
        return false;
    });
});

// Function from Jeremiah Andrews
function promiseToThrow(p, msg) {
    return p.then(_ => false).catch(_ => true).then(res => assert(res, msg));
}

