let RLP = require('rlp');
let ethjs_util = require('ethereumjs-util');

let { toHex } = require('../utilities.js');

// Wait for n blocks to pass
let mineNBlocks = async function(numBlocks) {
    for (i = 0; i < numBlocks; i++) {
    await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0});
    }
}

// Fast forward 1 week
let fastForward = async function(time) {
    await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0});
    let oldTime = (await web3.eth.getBlock(await web3.eth.blockNumber)).timestamp;

    // fast forward
    await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [time], id: 0});

    await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0});
    let currTime = (await web3.eth.getBlock(await web3.eth.blockNumber)).timestamp;

    assert.isAtLeast(currTime - oldTime, time, `Block time was not fast forwarded by at least ${time} seconds`);
}

// SHA256 hash the input and returns it in string form.
// Expects a hex input.
let sha256String = function(input) {
    return toHex(ethjs_util.sha256(toHex(input)).toString('hex'));
};

// SHA256 hashes together 2 inputs and returns it in string form.
// Expects hex inputs, and prepend each input with a 0x20 byte literal.
let sha256StringMultiple = function(input1, input2) {
    let toHash = "0x20" + input1.slice(2) + "20" + input2.slice(2);
    return toHex(ethjs_util.sha256(toHash).toString('hex'));
};

// For a given list of leaves, this function constructs a simple merkle tree.
// It returns the merkle root and the merkle proof for the txn at index.
// @param leaves The leaves for which this function generates a merkle root and proof
// @param txIndex The leaf for which this function generates a merkle proof
//
// Simple Tree: https://tendermint.com/docs/spec/blockchain/encoding.html#merkle-trees
let generateMerkleRootAndProof = function(leaves, index) {
    if (leaves.length == 0) { // If there are no leaves, then we can't generate anything
        return ["", ""];
    } else if (leaves.length == 1) { // If there's only 1 leaf, return it with and empty proof
        return [leaves[0], ""];
    } else {
        let pivot = Math.floor((leaves.length + 1) / 2);

        let left, right;
        let proof = "";

        // If the index will be in the left subtree (index < pivot), then we
        // need to generate the proof using the intermediary hash from the right
        // side. Otherwise, do the reverse.
        if (index < pivot) {
            // recursively call the function on the leaves that will be in the
            // left and right sub trees.
            left = generateMerkleRootAndProof(leaves.slice(0, pivot), index);
            right = generateMerkleRootAndProof(leaves.slice(pivot, leaves.length), -1);

            // add current level's right intermediary hash to the proof
            if (index >= 0) {
                proof = left[1] + right[0].slice(2);
            }
        } else {
            // recursively call the function on the leaves that will be in the
            // left and right sub trees.
            // since the index will be in the right sub tree, we need to update
            // it's value.
            left = generateMerkleRootAndProof(leaves.slice(0, pivot), -1);
            right = generateMerkleRootAndProof(leaves.slice(pivot, leaves.length), index - pivot);

            // add current level's left intermediary hash to the proof
            if (index >= 0) {
                proof = right[1] + left[0].slice(2);
            }
        }
        return [sha256StringMultiple(left[0], right[0]), toHex(proof)];
    }
};


// 512 bytes
let proof = '0000000000000000000000000000000000000000000000000000000000000000ad3228b676f7d3cd4284a5443f17f1962b36e491b30a40b2405849e597ba5fb5b4c11951957c6f8f642c4af61cd6b24640fec6dc7fc607ee8206a99e92410d3021ddb9a356815c3fac1026b6dec5df3124afbadb485c9ba5a3e3398a04b7ba85e58769b32a1beaf1ea27375a44095a0d1fb664ce2dd358e7fcbfb78c26a193440eb01ebfc9ed27500cd4dfc979272d1f0913cc9f66540d7e8005811109e1cf2d887c22bd8750d34016ac3c66b5ff102dacdd73f6b014e710b51e8022af9a1968ffd70157e48063fc33c97a050f7f640233bf646cc98d9524c6b92bcf3ab56f839867cc5f7f196b93bae1e27e6320742445d290f2263827498b54fec539f756afcefad4e508c098b9a7e1d8feb19955fb02ba9675585078710969d3440f5054e0f9dc3e7fe016e050eff260334f18a5d4fe391d82092319f5964f2e2eb7c1c3a5f8b13a49e282f609c317a833fb8d976d11517c571d1221a265d25af778ecf8923490c6ceeb450aecdc82e28293031d10c7d73bf85e57bf041a97360aa2c5d99cc1df82d9c4b87413eae2ef048f94b4d3554cea73d92b0f7af96e0271c691e2bb5c67add7c6caf302256adedf7ab114da0acfe870d449a3a489f781d659e8beccda7bce9f4e8618b6bd2f4132ce798cdc7a60e7e1460a7299e3c6342a579626d2';

let zeroHashes = [ '0000000000000000000000000000000000000000000000000000000000000000',
    'ad3228b676f7d3cd4284a5443f17f1962b36e491b30a40b2405849e597ba5fb5',
    'b4c11951957c6f8f642c4af61cd6b24640fec6dc7fc607ee8206a99e92410d30',
    '21ddb9a356815c3fac1026b6dec5df3124afbadb485c9ba5a3e3398a04b7ba85',
    'e58769b32a1beaf1ea27375a44095a0d1fb664ce2dd358e7fcbfb78c26a19344',
    '0eb01ebfc9ed27500cd4dfc979272d1f0913cc9f66540d7e8005811109e1cf2d',
    '887c22bd8750d34016ac3c66b5ff102dacdd73f6b014e710b51e8022af9a1968',
    'ffd70157e48063fc33c97a050f7f640233bf646cc98d9524c6b92bcf3ab56f83',
    '9867cc5f7f196b93bae1e27e6320742445d290f2263827498b54fec539f756af',
    'cefad4e508c098b9a7e1d8feb19955fb02ba9675585078710969d3440f5054e0',
    'f9dc3e7fe016e050eff260334f18a5d4fe391d82092319f5964f2e2eb7c1c3a5',
    'f8b13a49e282f609c317a833fb8d976d11517c571d1221a265d25af778ecf892',
    '3490c6ceeb450aecdc82e28293031d10c7d73bf85e57bf041a97360aa2c5d99c',
    'c1df82d9c4b87413eae2ef048f94b4d3554cea73d92b0f7af96e0271c691e2bb',
    '5c67add7c6caf302256adedf7ab114da0acfe870d449a3a489f781d659e8becc',
    'da7bce9f4e8618b6bd2f4132ce798cdc7a60e7e1460a7299e3c6342a579626d2' ];

module.exports = {
    fastForward,
    mineNBlocks,
    proof,
    zeroHashes,
    sha256String,
    generateMerkleRootAndProof
};
