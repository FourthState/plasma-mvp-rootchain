let PriorityQueue = artifacts.require("PriorityQueue");
let assert = require('chai').assert;
let to = require('./utilities.js').to;

contract('PriorityQueue', async (accounts) => {
    let instance;
    before (async () => {
        instance = await PriorityQueue.deployed();
    });
    it("Ascending insert", async () => {
        let currSize = parseInt(await instance.currentSize.call());
        for (i = 1; i < 6; i++) {
            await instance.insert(i);
        }

        currSize = parseInt(await instance.currentSize.call());
        assert.equal(currSize, 5, "currentSize did not increment");

        let min = parseInt(await instance.getMin());
        assert.equal(1, min, "getMin did not return the minimum");

        for (i = 0; i < 3; i++) {
            await instance.delMin();
        }

        min = parseInt(await instance.getMin());
        currSize = parseInt(await instance.currentSize.call());
        assert.equal(min, 4, "delMin deleted priorities out of order");
        assert.equal(currSize, 2, "currSize did not decrement");
        // Clear the queue
        for (i = 0; i < 2; i++) {
            await instance.delMin();
        }
    });

    it ("Insert from someone other than owner", async () => {
        let err;
        [err] = await to(instance.insert(3, {'from': accounts[1]}));
        if (!err) {
            assert(false, "Insert allowed for someone other than owner");
        }

        let currSize = parseInt(await instance.currentSize.call());
        assert.equal(currSize, 0, "Insert allowed for someone other than owner");
    });

    it ("Insert same priorities", async () => {
        let currentSize = parseInt(await instance.currentSize.call());
        assert.equal(currentSize, 0, "The size is not 0");

        await instance.insert(10);
        let min = parseInt(await instance.getMin());
        currentSize = parseInt(await instance.currentSize.call());
        assert.equal(currentSize, 1, "The size is not 0");
        
        // Breaks here - has min as 0 
        assert.equal(min, 10, "First insert did not work");

        await instance.insert(10);
        min = parseInt(await instance.getMin());
        assert.equal(min, 10, "Second insert of same priority did not work");
        await instance.insert(5);
        await instance.insert(5);

        currentSize = parseInt(await instance.currentSize.call());
        assert.equal(currentSize, 4, "The currentSize is incorrect")

        await instance.delMin();
        min = parseInt(await instance.getMin());
        assert.equal(min, 5, "PriorityQueue did not handle same priorities correctly");

        await instance.delMin();
        await instance.delMin();

        min = parseInt(await instance.getMin());
        assert.equal(min, 10, "PriorityQueue did not delete duplicate correctly")

        await instance.delMin();
    });
});
