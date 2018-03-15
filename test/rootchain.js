// testing libaries
let assert = require('chai').assert;
let expect = require('chai').expect;
let to = require('./utilities.js').to;

let RootChain = artifacts.require("RootChain");
let RLP = require('rlp');

contract('RootChain', async (accounts) => {
    it("Submitting block as authority", async () => {
        let instance = await RootChain.deployed();
        let curr = parseInt(await instance.currentChildBlock.call());

        for (i = 0; i < 5; i++) {
            await web3.eth.sendTransaction({'from': accounts[0], 'to': accounts[1], 'value': 100});
        }
        await instance.submitBlock('2984748479872');
        let next = parseInt(await instance.currentChildBlock.call());

        assert.equal(curr + 1, next, "Child block did not increment");
    });

    it("Depositing a block", async () => {
        let instance = await RootChain.deployed();
        //Why does this work? David's implementation requires txBytes to have length 11
        let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);
        let prev =  parseInt(await instance.currentChildBlock.call());

        await instance.deposit(txBytes.toString('binary'), {'from': accounts[2], 'value': 50000});
        let curr = parseInt(await instance.currentChildBlock.call());

        assert.equal(prev + 1, curr, "Child block did not increment")
    });

    it("Invalid deposits fails", async () => {
        let instance = await RootChain.deployed();
        let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, accounts[2], 50000, 0, 0, 0]);

        let err;
        [err] = await to(instance.deposit(txBytes.toString('binary'), {'from': accounts[2], 'value': 50}));
        if(!err)
            assert(false, "Invalid deposit, did not revert");
    });

    it("Submitting a block not as authority should fail", async () => {
        let instance = await RootChain.deployed();
        for (i = 0; i < 5; i++) {
            await web3.eth.sendTransaction({'from': accounts[0], 'to': accounts[1], 'value': 100});
        }

        let err;
        let prev = parseInt(await instance.currentChildBlock.call());
        [err] = await to(instance.submitBlock('496934090963', {'from': accounts[1]}))
        if(!err) {
            assert(false, "Submit allowed from wrong person!"); // this line should never be reached
        }

        let curr = parseInt(await instance.currentChildBlock.call());
        assert.equal(prev, curr, "Allowed submit block from someone other than authority!");
    });

    it("Starting valid exit", async () => {
        let instance = await RootChain.deployed();
    })
    
});

