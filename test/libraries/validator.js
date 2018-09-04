let RLP = require('rlp');
let assert = require('chai').assert;

let Validator_Test = artifacts.require("Validator_Test");
let { catchError, toHex, generateMerkleRootAndProof } = require('../utilities.js');
let {zeroHashes} = require('../rootchain/rootchain_helpers.js');

contract('Validator', async (accounts) => {
    let instance;
    before (async () => {
        instance = await Validator_Test.new();
    });

    it("Check membership of merkle tree with one transaction", async () => {
        let leafHash = web3.sha3("input_seed", {encoding: 'hex'});

        let root, proof;
        [root, proof] = generateMerkleRootAndProof([leafHash], 16, 0);

        assert.isTrue(await instance.checkMembership.call(toHex(leafHash), 0, toHex(root), toHex(proof)), "Didn't prove membership.");
    });

    it("Test check membership on bad inputs", async () => {
        let leafHash = web3.sha3("input_seed", {encoding: 'hex'});

        let root, proof;
        [root, proof] = generateMerkleRootAndProof([leafHash], 16, 0);

        let badLeafHash = web3.sha3("wrong_input_seed", {encoding: 'hex'});
        assert.isFalse(await instance.checkMembership.call(toHex(badLeafHash), 0, toHex(root), toHex(proof)), "Returned true on wrong leaf.");

        assert.isFalse(await instance.checkMembership.call(toHex(leafHash), 1, toHex(root), toHex(proof)), "Returned true on wrong index.");

        let badRoot = web3.sha3("wrong_root", {encoding: 'hex'});
        assert.isFalse(await instance.checkMembership.call(toHex(leafHash), 0, toHex(badRoot), toHex(proof)), "Returned true on wrong root.");

        let badProof = "0".repeat(proof.length);
        assert.isFalse(await instance.checkMembership.call(toHex(leafHash), 0, toHex(root), toHex(badProof)), "Returned true on wrong proof.");
    });

    it("Check membership of merkle tree with multiple transactions", async () => {
        let leafHash1 = web3.sha3("input_seed_1", {encoding: 'hex'});
        let leafHash2 = web3.sha3("input_seed_2", {encoding: 'hex'});
        let leafHash3 = web3.sha3("input_seed_3", {encoding: 'hex'});

        let root, proof;
        [root, proof] = generateMerkleRootAndProof([leafHash1, leafHash2, leafHash3], 16, 0);
        assert.isTrue(await instance.checkMembership.call(toHex(leafHash1), 0, toHex(root), toHex(proof)), "Didn't prove membership.");

        [root, proof] = generateMerkleRootAndProof([leafHash1, leafHash2, leafHash3], 16, 1);
        assert.isTrue(await instance.checkMembership.call(toHex(leafHash2), 1, toHex(root), toHex(proof)), "Didn't prove membership.");

        [root, proof] = generateMerkleRootAndProof([leafHash1, leafHash2, leafHash3], 16, 2);
        assert.isTrue(await instance.checkMembership.call(toHex(leafHash3), 2, toHex(root), toHex(proof)), "Didn't prove membership.");
    });

    it("Test Slice", async () => {
        let input_hash = web3.sha3("input_seed", {encoding: 'hex'});

        assert.equal((await instance.slice.call(toHex(input_hash), 0, 16)).toString(), toHex(input_hash.substring(2,34)), "Didn't git first half of the hash")
        assert.equal((await instance.slice.call(toHex(input_hash), 16, 16)).toString(), toHex(input_hash.substring(34)), "Didn't git second half of the hash")

        assert.equal((await instance.slice.call(toHex(input_hash), 0, 8)).toString(), toHex(input_hash.substring(2,18)), "Didn't git first quarter of the hash")
        assert.equal((await instance.slice.call(toHex(input_hash), 8, 24)).toString(), toHex(input_hash.substring(18)), "Didn't git rest of the hash")
    })
});
