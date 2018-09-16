let assert = require('chai').assert;
let RLP = require('rlp');

let Validator_Test = artifacts.require("Validator_Test");
let { catchError, toHex, generateMerkleRootAndProof } = require('../utilities.js');
let {zeroHashes} = require('../rootchain/rootchain_helpers.js');

contract('Validator', async (accounts) => {
    let instance;
    before (async () => {
        instance = await Validator_Test.new();
    });

    it("Check membership of merkle tree with one transaction", async () => {
        let leafHash = web3.sha3("inputSeed1eed", {encoding: 'hex'});

        let root, proof;
        [root, proof] = generateMerkleRootAndProof([leafHash], 0);

        assert.isTrue(await instance.checkMembership.call(toHex(leafHash), 0, toHex(root), toHex(proof)), "Didn't prove membership.");
    });

    it("Test check membership on bad inputs", async () => {
        let leafHash = web3.sha3("inputSeed", {encoding: 'hex'});

        let root, proof;
        [root, proof] = generateMerkleRootAndProof([leafHash], 0);

        let badLeafHash = web3.sha3("wrongInputSeed", {encoding: 'hex'});
        assert.isFalse(await instance.checkMembership.call(toHex(badLeafHash), 0, toHex(root), toHex(proof)), "Returned true on wrong leaf.");

        assert.isFalse(await instance.checkMembership.call(toHex(leafHash), 1, toHex(root), toHex(proof)), "Returned true on wrong index.");

        let badRoot = web3.sha3("wrongRoot", {encoding: 'hex'});
        assert.isFalse(await instance.checkMembership.call(toHex(leafHash), 0, toHex(badRoot), toHex(proof)), "Returned true on wrong root.");

        let badProof = "0".repeat(proof.length);
        assert.isFalse(await instance.checkMembership.call(toHex(leafHash), 0, toHex(root), toHex(badProof)), "Returned true on wrong proof.");
    });

    it("Check membership of merkle tree with multiple transactions", async () => {
        let leafHash1 = web3.sha3("inputSeed1", {encoding: 'hex'});
        let leafHash2 = web3.sha3("inputSeed2", {encoding: 'hex'});
        let leafHash3 = web3.sha3("inputSeed3", {encoding: 'hex'});
        let leafHash4 = web3.sha3("inputSeed4", {encoding: 'hex'});
        let leafHash5 = toHex(zeroHashes[0]);

        let root, proof;
        [root, proof] = generateMerkleRootAndProof([leafHash1, leafHash2, leafHash3, leafHash4, leafHash5], 0);
        assert.isTrue(await instance.checkMembership.call(toHex(leafHash1), 0, toHex(root), toHex(proof)), "Didn't prove membership.");

        [root, proof] = generateMerkleRootAndProof([leafHash1, leafHash2, leafHash3, leafHash4, leafHash5], 1);
        assert.isTrue(await instance.checkMembership.call(toHex(leafHash2), 1, toHex(root), toHex(proof)), "Didn't prove membership.");

        [root, proof] = generateMerkleRootAndProof([leafHash1, leafHash2, leafHash3, leafHash4, leafHash5], 2);
        assert.isTrue(await instance.checkMembership.call(toHex(leafHash3), 2, toHex(root), toHex(proof)), "Didn't prove membership.");

        [root, proof] = generateMerkleRootAndProof([leafHash1, leafHash2, leafHash3, leafHash4, leafHash5], 3);
        assert.isTrue(await instance.checkMembership.call(toHex(leafHash4), 3, toHex(root), toHex(proof)), "Didn't prove membership.");

        [root, proof] = generateMerkleRootAndProof([leafHash1, leafHash2, leafHash3, leafHash4, leafHash5], 4);
        assert.isTrue(await instance.checkMembership.call(toHex(leafHash5), 4, toHex(root), toHex(proof)), "Didn't prove membership.");
    });

    it("Test Slice", async () => {
        let inputHash = web3.sha3("inputSeed", {encoding: 'hex'});

        assert.equal((await instance.slice.call(toHex(inputHash), 0, 16)).toString(), toHex(inputHash.substring(2,34)), "Didn't git first half of the hash")
        assert.equal((await instance.slice.call(toHex(inputHash), 16, 16)).toString(), toHex(inputHash.substring(34)), "Didn't git second half of the hash")

        assert.equal((await instance.slice.call(toHex(inputHash), 0, 8)).toString(), toHex(inputHash.substring(2,18)), "Didn't git first quarter of the hash")
        assert.equal((await instance.slice.call(toHex(inputHash), 8, 24)).toString(), toHex(inputHash.substring(18)), "Didn't git rest of the hash")
    })

    it("Test recover", async () => {

        // create tx hash
        let txHash = web3.sha3("inputSeed", {encoding: 'hex'});

        let signer1 = accounts[1];
        // create tx sigs
        let txSigs1 = await web3.eth.sign(signer1, txHash);

        let signer2 = accounts[2];
        // create tx sigs
        let txSigs2 = await web3.eth.sign(signer2, txHash);

        assert.equal((await instance.recover.call(txHash, txSigs1)).toString(), signer1, "Recovered incorrect address.");
        assert.equal((await instance.recover.call(txHash, txSigs2)).toString(), signer2, "Recovered incorrect address.");
        assert.notEqual((await instance.recover.call(txHash, txSigs1)).toString(), (await instance.recover.call(txHash, txSigs2)).toString(), "Recovered the same address.");
    });

    it("Test checkSigs naive", async () => {
        let signer = accounts[5];
        let invalidSigner = accounts[6];

        let txHash = web3.sha3("tx bytes to be hashed");
        let sigs = await web3.eth.sign(signer, txHash);
        sigs += Buffer.alloc(65).toString('hex');

        let confirmationHash = web3.sha3("merkle leaf hash concat with root hash");

        let confirmSignatures = await web3.eth.sign(signer, confirmationHash);

        let invalidConfirmSignatures = await web3.eth.sign(invalidSigner, confirmationHash);
        invalidConfirmSignatures += Buffer.alloc(65).toString('hex');

        let input1 = false;

        // assert valid confirmSignatures will pass checkSigs
        assert.isTrue(await instance.checkSigs.call(txHash, toHex(confirmationHash), input1, toHex(sigs), toHex(confirmSignatures)), "checkSigs should pass.");
        // assert invalid confirmSignatures will not pass checkSigs
        assert.isFalse(await instance.checkSigs.call(txHash, toHex(confirmationHash), input1, toHex(sigs), toHex(invalidConfirmSignatures)), "checkSigs should not pass given invalid confirmSignatures.");
    });

    it("Test checkSigs with empty confirm sigs and empty tx sigs", async () => {
        let emptyConfirmSignatures = Buffer.alloc(130).toString('hex');
        let emptySigs = Buffer.alloc(130).toString('hex');

        let txHash = web3.sha3(Buffer.alloc(65).toString('hex'), {encoding: 'hex'});
        let confirmationHash = web3.sha3(Buffer.alloc(65).toString('hex'), {encoding: 'hex'});

        assert.isFalse(await instance.checkSigs.call(txHash, toHex(confirmationHash), false, toHex(emptySigs), toHex(emptyConfirmSignatures)), "checkSigs should not pass given empty tx sigs and confirm signatures.");

        assert.isFalse(await instance.checkSigs.call(txHash, toHex(confirmationHash), true, toHex(emptySigs), toHex(emptyConfirmSignatures)), "checkSigs should not pass given empty tx sigs and confirm signatures.");
    });

    it("Test checkSigs with first input", async () => {
        // create txHash
        let txBytes = Array(17).fill(0);
        txBytes[3] = 1; txBytes[12] = accounts[1]; txBytes[13] = 100;
        txBytes = RLP.encode(txBytes);
        let txHash = web3.sha3(txBytes.toString('hex'), {encoding: 'hex'});

        // create sigs
        let signer = accounts[4];
        let sigOverTxHash = await web3.eth.sign(signer, txHash);
        sigOverTxHash += Buffer.alloc(65).toString('hex');

        // create confirmationHash
        let merkleHash = web3.sha3(txHash.slice(2) + sigOverTxHash.slice(2), {encoding: 'hex'});
        let rootHash = generateMerkleRootAndProof([merkleHash], 0)[0];
        let confirmationHash = web3.sha3(merkleHash.slice(2) + rootHash, {encoding: 'hex'});

        // create confirmSignatures
        let confirmSignatures = await web3.eth.sign(signer, confirmationHash);

        let input1 = false;

        assert.isTrue(await instance.checkSigs.call(txHash, toHex(confirmationHash), input1, toHex(sigOverTxHash), toHex(confirmSignatures)), "checkSigs should pass.");

        // assert empty confirmSignatures will not pass checkSigs
        let emptyConfirmSignatures = Buffer.alloc(130).toString('hex');
        assert.isFalse(await instance.checkSigs.call(txHash, toHex(confirmationHash), input1, toHex(sigOverTxHash), toHex(emptyConfirmSignatures)), "checkSigs should not pass given empty confirmSignatures.");
    });

    it("Test checkSigs with only second input", async () => {
        // create txHash
        let txBytes = Array(17).fill(0);
        txBytes[9] = 1; txBytes[12] = accounts[1]; txBytes[13] = 100;
        txBytes = RLP.encode(txBytes);
        let txHash = web3.sha3(txBytes.toString('hex'), {encoding: 'hex'});

        // create sigs
        let signer = accounts[4];
        let sigOverTxHash = Buffer.alloc(65).toString('hex');
        sigOverTxHash += (await web3.eth.sign(signer, txHash)).slice(2);

        // create confirmationHash
        let merkleHash = web3.sha3(txHash.slice(2) + sigOverTxHash, {encoding: 'hex'});
        let rootHash = generateMerkleRootAndProof([merkleHash], 0)[0];
        let confirmationHash = web3.sha3(merkleHash.slice(2) + rootHash, {encoding: 'hex'});

        // create confirmSignatures
        let confirmSignatures = Buffer.alloc(65).toString('hex');
        confirmSignatures += (await web3.eth.sign(signer, confirmationHash)).slice(2);

        // create input0 and input1
        let input1 = true;

        assert.isTrue(await instance.checkSigs.call(txHash, toHex(confirmationHash), input1, toHex(sigOverTxHash), toHex(confirmSignatures)), "checkSigs should pass.");

        // assert empty confirmSignatures will not pass checkSigs
        let emptyConfirmSignatures = Buffer.alloc(130).toString('hex');
        assert.isFalse(await instance.checkSigs.call(txHash, toHex(confirmationHash), true, toHex(sigOverTxHash), toHex(emptyConfirmSignatures)), "checkSigs should not pass given empty txSigs and confirmSignatures.");
    });

    it("Test checkSigs with invalid tx sigs", async () => {
        // create txHash
        let txBytes = Array(17).fill(0);
        txBytes[3] = 1; txBytes[9] = 2; txBytes[12] = accounts[1]; txBytes[13] = 100;
        txBytes = RLP.encode(txBytes);
        let txHash = web3.sha3(txBytes.toString('hex'), {encoding: 'hex'});

        // create sigs
        let signer0 = accounts[4];
        let signer1 = accounts[5];
        let invalidSigner = accounts[6];
        let invalidSigner2 = accounts[7];

        // second tx sig is invalid
        let sigs = await web3.eth.sign(signer0, txHash);
        let validSigs = sigs + (await web3.eth.sign(signer1, txHash).slice(2));
        let invalidSigs = sigs + (await web3.eth.sign(invalidSigner, txHash).slice(2));

        // create confirmationHash
        let merkleHash = web3.sha3(txHash.slice(2) + validSigs.slice(2), {encoding: 'hex'});
        let rootHash = generateMerkleRootAndProof([merkleHash], 0)[0];
        let confirmationHash = web3.sha3(merkleHash.slice(2) + rootHash, {encoding: 'hex'});
        // create confirmSignatures
        let confirmSignatures = await web3.eth.sign(signer0, confirmationHash);
        confirmSignatures += await web3.eth.sign(signer1, confirmationHash).slice(2);
        // create invalid confirmSignatures
        let invalidConfirmSignatures = await web3.eth.sign(invalidSigner, confirmationHash);
        invalidConfirmSignatures += await web3.eth.sign(invalidSigner2, confirmationHash).slice(2);

        let input1 = true;

        assert.isFalse(await instance.checkSigs.call(txHash, toHex(confirmationHash), input1, toHex(invalidSigs), toHex(confirmSignatures)), "checkSigs should not pass given invalid transaction sigs.");
        assert.isFalse(await instance.checkSigs.call(txHash, toHex(confirmationHash), input1, toHex(validSigs), toHex(invalidConfirmSignatures)), "checkSigs should not pass given invalid transaction sigs.");
        assert.isTrue(await instance.checkSigs.call(txHash, toHex(confirmationHash), input1, toHex(validSigs), toHex(confirmSignatures)), "checkSigs should pass for valid transaction sigs.");
    });
});
