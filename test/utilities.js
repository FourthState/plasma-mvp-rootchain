let {zeroHashes} = require('./rootchain/rootchain_helpers.js');

/*
 How to avoid using try/catch blocks with promises' that could fail using async/await
 - https://blog.grossman.io/how-to-write-async-await-without-try-catch-blocks-in-javascript/
 */
let catchError = function(promise) {
  return promise.then(result => [null, result])
      .catch(err => [err]);
};

let toHex = function(buffer) {
    buffer = buffer.toString('hex');
    if (buffer.substring(0, 2) == '0x')
        return buffer;
    return '0x' + buffer;
};

// For a given list of leaves, this function generates a merkle root. It assumes
// the merkle tree is of depth 16. If there are less than 2^16 leaves, the
// list is padded with 0x0 transactions. The function also generates a merkle
// proof for the leaf at txIndex.
// @param leaves The leaves for which this function generates a merkle root and proof
// @param txIndex The leaf for which this function gneerates a merkle proof
let generateMerkleRootAndProof = function(leaves, txIndex) {
    return generateMerkleRootAndProofHelper(leaves, 16, txIndex, 0);
};

// This helper function recursively generates a merkle root and merkle proof for
// a given list of leaves and a leaf's txIndex.
let generateMerkleRootAndProofHelper = function(leaves, depth, txIndex, zeroHashesIndex) {
    // If the depth is 0, then we are already at the root. This means that we
    // expect there to only be one leaf, which is the root.
    if (depth == 0) {
        if (leaves.length == 1) {
            return [leaves[0], ""];
        }
        else {
            return ["", ""];
        }
    }
    else {
        let newLeaves = [];
        let proof = "";

        // For each pair of leaves, concat them together and hash the result
        let i = 0;
        while (i + 2 <= leaves.length) {
            let mergedHash = web3.sha3(leaves[i].slice(2) + leaves[i + 1].slice(2), {encoding: 'hex'});
            newLeaves.push(mergedHash);

            // For the txIndex of interest, we want to generate a merkle proof,
            // which means that we need to keep track of the other leaf in the
            // pair.
            if (txIndex == i) {
                proof = leaves[i + 1].slice(2);
            }
            else if (txIndex == i + 1) {
                proof = leaves[i].slice(2);
            }

            i += 2;
        }

        // If i < leaves.length, then that means there's an odd number of leaves
        // In this case, we need to hash the remaining leaf with the zeroHash of
        // the current depth, which has been hardcoded in "rootchain_helpers"
        if (i < leaves.length) {
            let mergedHash = web3.sha3(leaves[i].slice(2) + zeroHashes[zeroHashesIndex], {encoding: 'hex'});
            // For the txIndex of interest, we want to generate a merkle proof,
            // which means that we need to keep track of the other leaf in the
            // pair.
            if (txIndex == i) {
                proof = zeroHashes[zeroHashesIndex];
            }
            newLeaves.push(mergedHash);
        }

        // Recursively call the helper function, updating the variables we pass in
        // We expect to see the number of leaves to decrease by 1/2
        // This would be the next layer up in the merkle tree.
        let result =  generateMerkleRootAndProofHelper(newLeaves, depth - 1, Math.floor(txIndex/2), zeroHashesIndex + 1);

        result[1] = proof + result[1];

        return result;
    }
};

module.exports.catchError = catchError;
module.exports.toHex = toHex;
module.exports.generateMerkleRootAndProof = generateMerkleRootAndProof;
