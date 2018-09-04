let RLP = require('rlp');
let assert = require('chai').assert;

let Validator_Test = artifacts.require("Validator_Test");
let { catchError, toHex } = require('../utilities.js');
let {proof, zeroHashes} = require('../rootchain/rootchain_helpers.js');

contract('Validator', async (accounts) => {
    let instance;
    before (async () => {
        instance = await Validator_Test.new();
    });

    it("Check membership of merkle tree with one transaction", async () => {
        let leafHash = web3.sha3("input_seed", {encoding: 'hex'});

        // include this transaction in the next block
        let root = leafHash;
        for (let i = 0; i < 16; i++)
            root = web3.sha3(root + zeroHashes[i], {encoding: 'hex'}).slice(2);

        assert.isTrue(await instance.checkMembership.call(toHex(leafHash), 0, toHex(root), toHex(proof)), "Didn't prove membership.");
    });

    it("Test check membership on bad inputs", async () => {
        let leafHash = web3.sha3("input_seed", {encoding: 'hex'});

        // include this transaction in the next block
        let root = leafHash;
        for (let i = 0; i < 16; i++)
            root = web3.sha3(root + zeroHashes[i], {encoding: 'hex'}).slice(2);

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

        let firstHash =  web3.sha3(leafHash1.slice(2) + leafHash2.slice(2), {encoding: 'hex'}).slice(2);

        // include this transaction in the next block
        let root = firstHash;
        for (let i = 1; i < 16; i++)
            root = web3.sha3(root + zeroHashes[i], {encoding: 'hex'}).slice(2);

        proof = leafHash2 + 'ad3228b676f7d3cd4284a5443f17f1962b36e491b30a40b2405849e597ba5fb5b4c11951957c6f8f642c4af61cd6b24640fec6dc7fc607ee8206a99e92410d3021ddb9a356815c3fac1026b6dec5df3124afbadb485c9ba5a3e3398a04b7ba85e58769b32a1beaf1ea27375a44095a0d1fb664ce2dd358e7fcbfb78c26a193440eb01ebfc9ed27500cd4dfc979272d1f0913cc9f66540d7e8005811109e1cf2d887c22bd8750d34016ac3c66b5ff102dacdd73f6b014e710b51e8022af9a1968ffd70157e48063fc33c97a050f7f640233bf646cc98d9524c6b92bcf3ab56f839867cc5f7f196b93bae1e27e6320742445d290f2263827498b54fec539f756afcefad4e508c098b9a7e1d8feb19955fb02ba9675585078710969d3440f5054e0f9dc3e7fe016e050eff260334f18a5d4fe391d82092319f5964f2e2eb7c1c3a5f8b13a49e282f609c317a833fb8d976d11517c571d1221a265d25af778ecf8923490c6ceeb450aecdc82e28293031d10c7d73bf85e57bf041a97360aa2c5d99cc1df82d9c4b87413eae2ef048f94b4d3554cea73d92b0f7af96e0271c691e2bb5c67add7c6caf302256adedf7ab114da0acfe870d449a3a489f781d659e8beccda7bce9f4e8618b6bd2f4132ce798cdc7a60e7e1460a7299e3c6342a579626d2';

        assert.isTrue(await instance.checkMembership.call(toHex(leafHash1), 0, toHex(root), toHex(proof)), "Didn't prove membership.");

        proof = leafHash1 + 'ad3228b676f7d3cd4284a5443f17f1962b36e491b30a40b2405849e597ba5fb5b4c11951957c6f8f642c4af61cd6b24640fec6dc7fc607ee8206a99e92410d3021ddb9a356815c3fac1026b6dec5df3124afbadb485c9ba5a3e3398a04b7ba85e58769b32a1beaf1ea27375a44095a0d1fb664ce2dd358e7fcbfb78c26a193440eb01ebfc9ed27500cd4dfc979272d1f0913cc9f66540d7e8005811109e1cf2d887c22bd8750d34016ac3c66b5ff102dacdd73f6b014e710b51e8022af9a1968ffd70157e48063fc33c97a050f7f640233bf646cc98d9524c6b92bcf3ab56f839867cc5f7f196b93bae1e27e6320742445d290f2263827498b54fec539f756afcefad4e508c098b9a7e1d8feb19955fb02ba9675585078710969d3440f5054e0f9dc3e7fe016e050eff260334f18a5d4fe391d82092319f5964f2e2eb7c1c3a5f8b13a49e282f609c317a833fb8d976d11517c571d1221a265d25af778ecf8923490c6ceeb450aecdc82e28293031d10c7d73bf85e57bf041a97360aa2c5d99cc1df82d9c4b87413eae2ef048f94b4d3554cea73d92b0f7af96e0271c691e2bb5c67add7c6caf302256adedf7ab114da0acfe870d449a3a489f781d659e8beccda7bce9f4e8618b6bd2f4132ce798cdc7a60e7e1460a7299e3c6342a579626d2';

        assert.isTrue(await instance.checkMembership.call(toHex(leafHash2), 1, toHex(root), toHex(proof)), "Didn't prove membership.");
    });

    it("Test Slice", async () => {
        let input_hash = web3.sha3("input_seed", {encoding: 'hex'});

        assert.equal((await instance.slice.call(toHex(input_hash), 0, 16)).toString(), toHex(input_hash.substring(2,34)), "Didn't git first half of the hash")
        assert.equal((await instance.slice.call(toHex(input_hash), 16, 16)).toString(), toHex(input_hash.substring(34)), "Didn't git second half of the hash")

        assert.equal((await instance.slice.call(toHex(input_hash), 0, 8)).toString(), toHex(input_hash.substring(2,18)), "Didn't git first quarter of the hash")
        assert.equal((await instance.slice.call(toHex(input_hash), 8, 24)).toString(), toHex(input_hash.substring(18)), "Didn't git rest of the hash")
    })
});
