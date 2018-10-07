let RLP = require('rlp');

let utilities = require('../utilities.js');

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

    let diff = (currTime - oldTime) - time;
    assert.isBelow(diff, 3, "Block time was not fast forwarded by 1 week");
}

// helper function to send a UTXO on childchain and submit blockheader to rootchain.
let sendUTXO = async function(rootchain, authority, sender, txBytes) {
    // sender sends a deposit UTXO to recipient
    let txHash = web3.sha3(txBytes.toString('hex'), {encoding: 'hex'});
    let sigs = await web3.eth.sign(sender, txHash);
    sigs += Buffer.alloc(65).toString('hex');

    let merkleHash = web3.sha3(txHash.slice(2) + sigs.slice(2), {encoding: 'hex'});

    // the transaction is included in a new block,
    // the block header is submitted to rootchain
    let merkleRoot, merkleProof;
    [merkleRoot, merkleProof] = utilities.generateMerkleRootAndProof([merkleHash], 0);

    let blockNum = (await rootchain.currentChildBlock.call()).toNumber();
    // presumed finality before submitting the block
    mineNBlocks(5);
    await rootchain.submitBlock(utilities.toHex(merkleRoot), {from: authority});

    // sender signs confirmSig for the transaction
    let confirmHash = web3.sha3(merkleHash.slice(2) + merkleRoot.slice(2), {encoding: 'hex'});
    let confirmSignature = await web3.eth.sign(sender, confirmHash);

    return [sigs, confirmSignature, blockNum, merkleProof];
}


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
    sendUTXO
};
