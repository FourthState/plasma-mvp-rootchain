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
        let leafHash = web3.sha3("input_seed", {encoding: 'hex'});

        let root, proof;
        [root, proof] = generateMerkleRootAndProof([leafHash], 0);

        assert.isTrue(await instance.checkMembership.call(toHex(leafHash), 0, toHex(root), toHex(proof)), "Didn't prove membership.");
    });

    it("Test check membership on bad inputs", async () => {
        let leafHash = web3.sha3("input_seed", {encoding: 'hex'});

        let root, proof;
        [root, proof] = generateMerkleRootAndProof([leafHash], 0);

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
        [root, proof] = generateMerkleRootAndProof([leafHash1, leafHash2, leafHash3], 0);
        assert.isTrue(await instance.checkMembership.call(toHex(leafHash1), 0, toHex(root), toHex(proof)), "Didn't prove membership.");

        [root, proof] = generateMerkleRootAndProof([leafHash1, leafHash2, leafHash3], 1);
        assert.isTrue(await instance.checkMembership.call(toHex(leafHash2), 1, toHex(root), toHex(proof)), "Didn't prove membership.");

        [root, proof] = generateMerkleRootAndProof([leafHash1, leafHash2, leafHash3], 2);
        assert.isTrue(await instance.checkMembership.call(toHex(leafHash3), 2, toHex(root), toHex(proof)), "Didn't prove membership.");
    });

    it("Test Slice", async () => {
        let input_hash = web3.sha3("input_seed", {encoding: 'hex'});

        assert.equal((await instance.slice.call(toHex(input_hash), 0, 16)).toString(), toHex(input_hash.substring(2,34)), "Didn't git first half of the hash")
        assert.equal((await instance.slice.call(toHex(input_hash), 16, 16)).toString(), toHex(input_hash.substring(34)), "Didn't git second half of the hash")

        assert.equal((await instance.slice.call(toHex(input_hash), 0, 8)).toString(), toHex(input_hash.substring(2,18)), "Didn't git first quarter of the hash")
        assert.equal((await instance.slice.call(toHex(input_hash), 8, 24)).toString(), toHex(input_hash.substring(18)), "Didn't git rest of the hash")
    })

    it("Test checkSigs naive", async () => {
        let signer = accounts[5];
        let invalidSigner = accounts[6];

        let txHash = web3.sha3("tx bytes to be hashed");
        let sigs = await web3.eth.sign(signer, txHash);
        sigs += Buffer.alloc(65).toString('hex');

        let confirmationHash = web3.sha3("merkle leaf hash concat with root hash");

        let confirmSignatures = await web3.eth.sign(signer, confirmationHash);
        confirmSignatures += Buffer.alloc(65).toString('hex');

        let invalidConfirmSignatures = await web3.eth.sign(invalidSigner, confirmationHash);
        invalidConfirmSignatures += Buffer.alloc(65).toString('hex');

        let input0 = true;
        let input1 = false;
        
        // assert valid confirmSignatures will pass checkSigs
        assert.isTrue(await instance.checkSigs.call(txHash, toHex(confirmationHash), input0, input1, toHex(sigs), toHex(confirmSignatures)), "checkSigs should pass.");
        // assert invalid confirmSignatures will not pass checkSigs
        assert.isFalse(await instance.checkSigs.call(txHash, toHex(confirmationHash), input0, input1, toHex(sigs), toHex(invalidConfirmSignatures)), "checkSigs should not pass given invalid confirmSignatures.");
        // assert empty confirmSignatures will not pass checkSigs
        let emptyConfirmSignatures = Buffer.alloc(130).toString('hex');
        assert.isFalse(await instance.checkSigs.call(txHash, toHex(confirmationHash), input0, input1, toHex(sigs), toHex(emptyConfirmSignatures)), "checkSigs should not pass given empty confirmSignatures.");
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
        let rootHash = merkleHash;
        for (let i = 0; i < 16; i++) {
            rootHash = web3.sha3(rootHash + zeroHashes[i], {encoding: 'hex'}).slice(2);
        }
        let confirmationHash = web3.sha3(merkleHash.slice(2) + rootHash, {encoding: 'hex'});

        // create confirmSignatures
        let confirmSignatures = await web3.eth.sign(signer, confirmationHash);
        confirmSignatures += Buffer.alloc(65).toString('hex');

        assert.isTrue(await instance.checkSigs.call(txHash, toHex(confirmationHash), true, false, toHex(sigOverTxHash), toHex(confirmSignatures)), "checkSigs should pass.");

        // assert empty confirmSignatures will not pass checkSigs
        let emptyConfirmSignatures = Buffer.alloc(130).toString('hex');
        assert.isFalse(await instance.checkSigs.call(txHash, toHex(confirmationHash), true, false, toHex(sigOverTxHash), toHex(emptyConfirmSignatures)), "checkSigs should not pass given empty confirmSignatures.");
    });

    it("Test checkSigs with second input", async () => {
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
        let rootHash = merkleHash;
        for (let i = 0; i < 16; i++) {
            rootHash = web3.sha3(rootHash + zeroHashes[i], {encoding: 'hex'}).slice(2);
        }
        let confirmationHash = web3.sha3(merkleHash.slice(2) + rootHash, {encoding: 'hex'});

        // create confirmSignatures
        let confirmSignatures = Buffer.alloc(65).toString('hex');
        confirmSignatures += (await web3.eth.sign(signer, confirmationHash)).slice(2);

        // create input0 and input1
        let input0 = false;
        let input1 = true;

        assert.isTrue(await instance.checkSigs.call(txHash, toHex(confirmationHash), input0, input1, toHex(sigOverTxHash), toHex(confirmSignatures)), "checkSigs should pass.");

        // assert empty confirmSignatures will not pass checkSigs
        let emptyConfirmSignatures = Buffer.alloc(130).toString('hex');
        assert.isFalse(await instance.checkSigs.call(txHash, toHex(confirmationHash), input0, input1, toHex(sigOverTxHash), toHex(emptyConfirmSignatures)), "checkSigs should not pass given empty confirmSignatures.");
    });

    it("Test checkSigs with both inputs", async () => {
        // create txHash
        let txBytes = Array(17).fill(0);
        txBytes[3] = 1; txBytes[9] = 2; txBytes[12] = accounts[1]; txBytes[13] = 100;
        txBytes = RLP.encode(txBytes);
        let txHash = web3.sha3(txBytes.toString('hex'), {encoding: 'hex'});

        // create sigs
        let signer0 = accounts[4];
        let signer1 = accounts[5];
        let invalidSigner = accounts[6];
        let sigOverTxHash = await web3.eth.sign(signer0, txHash);
        sigOverTxHash += await web3.eth.sign(signer1, txHash).slice(2);

        // create confirmationHash
        let merkleHash = web3.sha3(txHash.slice(2) + sigOverTxHash.slice(2), {encoding: 'hex'});
        let rootHash = merkleHash;
        for (let i = 0; i < 16; i++) {
            rootHash = web3.sha3(rootHash + zeroHashes[i], {encoding: 'hex'}).slice(2);
        }
        let confirmationHash = web3.sha3(merkleHash.slice(2) + rootHash, {encoding: 'hex'});
        // create confirmSignatures
        let confirmSignatures = await web3.eth.sign(signer0, confirmationHash);
        confirmSignatures += await web3.eth.sign(signer1, confirmationHash).slice(2);

        // create input0 and input1
        let input0 = true;
        let input1 = true;

        assert.isTrue(await instance.checkSigs.call(txHash, toHex(confirmationHash), input0, input1, toHex(sigOverTxHash), toHex(confirmSignatures)), "checkSigs should pass.");

        // check one valid confirmSig and one invalid confirmSig does not pass check
        let invalidSecondConfirmSignature = await (web3.eth.sign(signer0, confirmationHash) + web3.eth.sign(invalidSigner, confirmationHash).slice(2));
        assert.isFalse(await instance.checkSigs.call(txHash, toHex(confirmationHash), input0, input1, toHex(sigOverTxHash), toHex(invalidSecondConfirmSignature)), "checkSigs should not pass if one of the two given confirmSignatures is invalid.");
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

        // second tx sig is invalid
        let sigs = await web3.eth.sign(signer0, txHash);
        let validSigs = sigs + (await web3.eth.sign(signer1, txHash).slice(2));
        let invalidSigs = sigs + (await web3.eth.sign(invalidSigner, txHash).slice(2));

        // create confirmationHash
        let merkleHash = web3.sha3(txHash.slice(2) + validSigs.slice(2), {encoding: 'hex'});
        let rootHash = merkleHash;
        for (let i = 0; i < 16; i++) {
            rootHash = web3.sha3(rootHash + zeroHashes[i], {encoding: 'hex'}).slice(2);
        }
        let confirmationHash = web3.sha3(merkleHash.slice(2) + rootHash, {encoding: 'hex'});
        // create confirmSignatures
        let confirmSignatures = await web3.eth.sign(signer0, confirmationHash);
        confirmSignatures += await web3.eth.sign(signer1, confirmationHash).slice(2);

        // create input0 and input1
        let input0 = true;
        let input1 = true;

        assert.isFalse(await instance.checkSigs.call(txHash, toHex(confirmationHash), input0, input1, toHex(invalidSigs), toHex(confirmSignatures)), "checkSigs should not pass given invalid transaction sigs.");

        assert.isTrue(await instance.checkSigs.call(txHash, toHex(confirmationHash), input0, input1, toHex(validSigs), toHex(confirmSignatures)), "checkSigs should pass for valid transaction sigs.");
    });
});

