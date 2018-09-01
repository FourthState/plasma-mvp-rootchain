let assert = require('chai').assert;

let PriorityQueue_Test = artifacts.require("PriorityQueue_Test");
let { catchError } = require('../utilities.js');

contract('PriorityQueue', async (accounts) => {
    let instance;
    before (async () => {
        instance = await PriorityQueue_Test.new({from: accounts[0]});
    });

    it("Add then remove", async () => {
        await instance.insert(2)
        await instance.insert(1)
        await instance.insert(3)

        assert.equal((await instance.getMin.call()).toNumber(), 1, "Did not delete correct minimum")

        await instance.delMin()
        assert.equal((await instance.getMin.call()).toNumber(), 2, "Did not delete correct minimum")

        await instance.delMin()
        assert.equal((await instance.getMin.call()).toNumber(), 3, "Did not delete correct minimum")

        await instance.delMin()
        assert(await instance.currentSize.call() == 0, "Size is not zero")
    })

    it("Ascending insert", async () => {
        let currSize = (await instance.currentSize.call()).toNumber();
        for (i = 1; i < 6; i++) {
            await instance.insert(i);
        }

        currSize = (await instance.currentSize.call()).toNumber();
        assert.equal(currSize, 5, "currentSize did not increment");

        let min = (await instance.getMin.call()).toNumber();
        assert.equal(1, min, "getMin did not return the minimum");

        for (i = 0; i < 3; i++) {
            await instance.delMin();
        }

        min = (await instance.getMin.call()).toNumber();
        currSize = (await instance.currentSize.call()).toNumber();
        assert.equal(min, 4, "delMin deleted priorities out of order");
        assert.equal(currSize, 2, "currSize did not decrement");

        // Clear the queue
        for (i = 0; i < 2; i++) {
            await instance.delMin();
        }
        currSize = (await instance.currentSize.call()).toNumber();
        assert.equal(currSize, 0, "The priority queue has not been emptied");
    });

    it ("Insert from someone other than owner", async () => {
        let err;
        [err] = await catchError(instance.insert(3, {'from': accounts[1]}));
        if (!err) {
            assert(false, "Insert allowed for someone other than owner");
        }

        let currSize = (await instance.currentSize.call()).toNumber();
        assert.equal(currSize, 0, "Insert allowed for someone other than owner");
    });

    it("Insert, delete min, insert again", async () => {
        for (i = 1; i < 6; i++) {
            await instance.insert(i);
            let min = (await instance.getMin.call()).toNumber();
            assert.equal(min, 1, "getMin does not return minimum element in pq.");
        }

        // partially clear the pq
        for (i = 0; i < 3; i++) {
            await instance.delMin();
        }
        min = (await instance.getMin.call()).toNumber();
        assert.equal(min, 4, "delMin deleted priorities out of order");

        // insert to pq after partial delete
        for (i = 2; i < 4; i++) {
            await instance.insert(i);
            let min = (await instance.getMin.call()).toNumber();
            assert.equal(min, 2, "getMin does not return minimum element in pq.");
        }
        // clear the pq
        for (i = 0; i < 4; i++) {
            await instance.delMin();
        }

        currSize = (await instance.currentSize.call()).toNumber();
        assert.equal(currSize, 0, "The priority queue has not been emptied");
    });

    it ("Insert same priorities", async () => {
        let currentSize = (await instance.currentSize.call()).toNumber();
        assert.equal(currentSize, 0, "The size is not 0");

        await instance.insert(10);
        let min = (await instance.getMin.call()).toNumber();
        currentSize = (await instance.currentSize.call()).toNumber();
        assert.equal(currentSize, 1, "The size is not 0");

        // Breaks here - has min as 0
        assert.equal(min, 10, "First insert did not work");

        await instance.insert(10);
        min = (await instance.getMin.call()).toNumber();
        assert.equal(min, 10, "Second insert of same priority did not work");
        await instance.insert(5);
        await instance.insert(5);

        currentSize = (await instance.currentSize.call()).toNumber();
        assert.equal(currentSize, 4, "The currentSize is incorrect")

        await instance.delMin();
        min = (await instance.getMin.call()).toNumber();
        assert.equal(min, 5, "PriorityQueue did not handle same priorities correctly");

        await instance.delMin();
        await instance.delMin();

        min = (await instance.getMin.call()).toNumber();
        assert.equal(min, 10, "PriorityQueue did not delete duplicate correctly")

        await instance.delMin();
        assert.equal(await instance.currentSize.call(), 0)
    });
});
