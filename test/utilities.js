let RLP = require('rlp');

/*
 How to avoid using try/catch blocks with promises' that could fail using async/await
 - https://blog.grossman.io/how-to-write-async-await-without-try-catch-blocks-in-javascript/
 */
let to = function(promise) {
  return promise.then(result => [null, result])
      .catch(err => [err]);
};

let toHex = function(buffer) {
    buffer = buffer.toString('hex');
    if (buffer.substring(0, 2) == '0x')
        return buffer;
    return '0x' + buffer.toString('hex');
}

let createAndDepositTX = async function(rootchain, address, amount) {
    // submit a deposit
    let blockNum = (await rootchain.getDepositBlock.call()).toNumber();
    let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, address, amount, 0, 0, 0]);
    let validatorBlock = await rootchain.currentChildBlock.call();
    await rootchain.deposit(validatorBlock, toHex(txBytes), {from: address, value: amount});

    // construct the confirm sig
    // Remove all 0x prefixes from hex strings
    let blockHeader = (await rootchain.getChildChain.call(blockNum))[0];
    let txHash = web3.sha3(txBytes.toString('hex'), {encoding: 'hex'});
    let sigs = Buffer.alloc(130).toString('hex');

    // create the confirm sig
    let confirmHash = web3.sha3(txHash.slice(2) + sigs + blockHeader.slice(2), {encoding: 'hex'});
    let confirmSignature = await web3.eth.sign(address, confirmHash);

    return [blockNum, confirmHash, confirmSignature, txBytes, txHash, sigs, blockHeader];
};

// 512 bytes
let proofForDepositBlock = '0000000000000000000000000000000000000000000000000000000000000000ad3228b676f7d3cd4284a5443f17f1962b36e491b30a40b2405849e597ba5fb5b4c11951957c6f8f642c4af61cd6b24640fec6dc7fc607ee8206a99e92410d3021ddb9a356815c3fac1026b6dec5df3124afbadb485c9ba5a3e3398a04b7ba85e58769b32a1beaf1ea27375a44095a0d1fb664ce2dd358e7fcbfb78c26a193440eb01ebfc9ed27500cd4dfc979272d1f0913cc9f66540d7e8005811109e1cf2d887c22bd8750d34016ac3c66b5ff102dacdd73f6b014e710b51e8022af9a1968ffd70157e48063fc33c97a050f7f640233bf646cc98d9524c6b92bcf3ab56f839867cc5f7f196b93bae1e27e6320742445d290f2263827498b54fec539f756afcefad4e508c098b9a7e1d8feb19955fb02ba9675585078710969d3440f5054e0f9dc3e7fe016e050eff260334f18a5d4fe391d82092319f5964f2e2eb7c1c3a5f8b13a49e282f609c317a833fb8d976d11517c571d1221a265d25af778ecf8923490c6ceeb450aecdc82e28293031d10c7d73bf85e57bf041a97360aa2c5d99cc1df82d9c4b87413eae2ef048f94b4d3554cea73d92b0f7af96e0271c691e2bb5c67add7c6caf302256adedf7ab114da0acfe870d449a3a489f781d659e8beccda7bce9f4e8618b6bd2f4132ce798cdc7a60e7e1460a7299e3c6342a579626d2'

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

// let txBytesBad = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, address, 100000, 0, 0, 0]);

module.exports = {
    to,
    toHex,
    createAndDepositTX,
    proofForDepositBlock,
    zeroHashes,
};
