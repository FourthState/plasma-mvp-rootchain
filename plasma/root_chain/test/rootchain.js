var RootChain = artifacts.require("RootChain");
var RLP = artifacts.require('rlp')

contract('RootChain', accounts => {
    it("Submit block from authority passes", () => {
        RootChain.deployed().then(async (instance) => {
            var curr = await instance.currentChildBlock.call().then(x => {return parseInt(x)})
            for (i = 0; i < 5; i++) {
                await instance.donate({'value': 5});
            }
            await instance.submitBlock('2984748479872');
            var next = await instance.currentChildBlock.call().then(y => {return parseInt(y)})
            console.log("start 1");
            assert.equal(curr + 1, next, "Child block did not increment");
            console.log("end 1");
        });
    });
    it("Depositing a block", () => {
        RootChain.deployed().then(async (instance) => {
            //Why does this work? David's implementation requires txBytes to have length 11
            var txBytes = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0,
            accounts[2], 50000, 0, 0, 0]);
            var prev =  await instance.currentChildBlock.call().then(x => {return parseInt(x)})
            await instance.deposit(txBytes, {'from': accounts[2], 'value': 50000});
            var curr = await instance.currentChildBlock.call().then(x => {return parseInt(x)})
            assert.equal(prev + 1, curr, "Child block did not increment")
        });
    });
    it("Invalid deposits fail", () => {
        RootChain.deployed().then(async (instance) => {
            var txBytes = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0,
                accounts[2], 50000, 0, 0, 0]);
            assert.fail(await instance.deposit(txBytes, {'from': accounts[3], 'value': 50000}), "Allowed deposit from wrong account!")
            assert.fail(await instance.deposit(txBytes, {'from': accounts[2], 'value': 50}), "Allowed deposit with wrong amount!")
        });
    })
    it("Submit block from someone other than authority fails", () => {
        RootChain.deployed().then(async (instance) => {
            for (i = 0; i < 5; i++) {
                await instance.donate({'value': 5});
            }
            console.log("start 2")
            assert.fail(await instance.submitBlock('496934090963', {'from': accounts[1]}));
            console.log("end 2")
        });
    });
});

