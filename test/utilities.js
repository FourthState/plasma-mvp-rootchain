/*
 How to avoid using try/catch blocks with promises' that could fail using async/await
 - https://blog.grossman.io/how-to-write-async-await-without-try-catch-blocks-in-javascript/
 */

let {zeroHashes} = require('./rootchain/rootchain_helpers.js');

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

let generateMerkleRootAndProof = function(leaves, txIndex) {
    return generateMerkleRootAndProofHelper(leaves, 16, txIndex, 0);
};

let generateMerkleRootAndProofHelper = function(leaves, depth, txIndex, zeroHashesIndex) {
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

        let i = 0;
        while (i + 2 <= leaves.length) {
            let mergedHash = web3.sha3(leaves[i].slice(2) + leaves[i + 1].slice(2), {encoding: 'hex'});
            newLeaves.push(mergedHash);

            if (txIndex == i) {
                proof = leaves[i + 1].slice(2);
            }
            else if (txIndex == i + 1) {
                proof = leaves[i].slice(2);
            }

            i += 2;
        }

        if (i < leaves.length) {
            let mergedHash = web3.sha3(leaves[i].slice(2) + zeroHashes[zeroHashesIndex], {encoding: 'hex'});
            if (txIndex == i) {
                proof = zeroHashes[zeroHashesIndex];
            }
            newLeaves.push(mergedHash);
        }

        let result =  generateMerkleRootAndProofHelper(newLeaves, depth - 1, Math.floor(txIndex/2), zeroHashesIndex + 1);

        result[1] = proof + result[1];

        return result;
    }
};

module.exports = {
    catchError,
    toHex,
    generateMerkleRootAndProof
};
