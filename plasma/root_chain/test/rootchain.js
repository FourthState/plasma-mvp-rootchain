var RootChain = artifacts.require("RootChain");
var RLP = require('rlp');

contract('RootChain', accounts => {
    it("Submit block from authority passes", () => {
        return RootChain.deployed().then(async (instance) => {
            var curr = await instance.currentChildBlock.call().then(x => {return parseInt(x)})
            for (i = 0; i < 5; i++) {
                await instance.donate({'value': 5});
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
    it("Deposit and slow deposit have same behavior", () => {
        return RootChain.deployed().then(async (instance) => {
            var txBytes = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], 750000, 0, 0, 0]);
            let start = await instance.currentChildBlock.call().then(x => {return parseInt(x)});
            let fastDeposit = await instance.deposit(txBytes.toString('binary'), {'from': accounts[2], 'value': 750000}); //approx 3x improvement
            let slowDeposit = await instance.slowDeposit(txBytes.toString('binary'), {'from': accounts[2], 'value': 750000});
            let fastRoot = await instance.childChain.call(start).then(x => {return x[0]})
            let slowRoot = await instance.childChain.call(start + 1).then(x => {return x[0]})
            assert.equal(slowRoot, fastRoot, "Deposit not implemented correctly!")
        })
        return false;
    })
    it("Invalid deposits fail", () => {
        try {
            RootChain.deployed().then(async (instance) => {
                var txBytes = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
                assert.fail(await instance.deposit(txBytes.toString('binary'), {'from': accounts[2], 'value': 50}), "Allowed deposit with wrong amount!")
            });
            return false;
        }
        catch (e) {
            return true;
        }
    })
    it("Submit block from someone other than authority fails", () => {
        try {
        RootChain.deployed().then(async (instance) => {
            for (i = 0; i < 5; i++) {
                await instance.donate({'value': 5});
            }
            var prev = await instance.currentChildBlock.call().then(x => {return parseInt(x)})
            assert.fail(await instance.submitBlock('496934090963', {'from': accounts[1]}));
            var curr = await instance.currentChildBlock.call().then(x => {return parseInt(x)})
            assert.equal(prev, curr, "Allowed submit block from someone other than authority!");
        });
        return false;
        }
        catch(e) {
            return true;
        }
    });
});

