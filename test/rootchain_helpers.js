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
};

// Create a generic deposit
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

// Wait for n blocks to pass
let waitForNBlocks = async function(numBlocks, authority) {
  for (i = 0; i < numBlocks; i++) {
    await web3.eth.sendTransaction({from: authority, 'to': authority, value: 100});
  }
}

// submit a valid deposit
// checks that it succeeds
let submitValidDeposit = async function(rootchain, sender, txBytes, amount) {
  let prevValidatorBlock = parseInt(await rootchain.currentChildBlock.call());
  let prevDepositBlock = parseInt(await rootchain.getDepositBlock.call())

  let result = await rootchain.deposit(prevValidatorBlock, toHex(txBytes), {from: sender, value: amount});

  let currValidatorBlock = parseInt(await rootchain.currentChildBlock.call());
  let currDepositBlock = parseInt(await rootchain.getDepositBlock.call())

  assert.equal(prevValidatorBlock, currValidatorBlock, "Child block incremented after Deposit.");
  assert.equal(prevDepositBlock + 1, currDepositBlock, "Deposit block did not increment");

  assert.equal(result.logs[0].args.depositor, sender, 'Deposit event does not match depositor address.');
  assert.equal(parseInt(result.logs[0].args.amount), amount, 'Deposit event does not match deposit amount.');

  assert.equal(prevDepositBlock + 1, currDepositBlock, "Child block did not increment");

  return [prevValidatorBlock, prevDepositBlock, currValidatorBlock, currDepositBlock];
}

// submit an invalid deposit
// checks that it fails
let submitInvalidDeposit = async function (rootchain, sender, validatorBlock, txBytes, amount) {
  let err;
  [err] = await to(rootchain.deposit(validatorBlock, toHex(txBytes), {from: sender, value: amount}));
  if (!err) {
      assert.fail("Invalid deposit, did not revert");
  }
}

// submit a block
// can toggle whether it succeeds or not
// checks for correct behavior
let submitBlockCheck = async function (rootchain, authority, blockRoot, sender, numWaitBlocks, shouldsucceed, validatorBlock) {
  waitForNBlocks(numWaitBlocks, authority);

  let err;
  [err] = await to(rootchain.submitBlock(web3.fromAscii(blockRoot), {from: sender}));
  if (shouldsucceed && err) {
      assert.fail("submitBlock fails when it shouldn't");
  }
  if (!shouldsucceed && !err) {
      assert.fail("submitBlock doesn't fail when it should");
  }
  if (shouldsucceed) {
    let interval = parseInt(await rootchain.childBlockInterval.call())
    let newValidatorBlock = parseInt(await rootchain.currentChildBlock.call())
    assert.equal(validatorBlock + interval, newValidatorBlock, "Validator Block doesn't increment")
  }
}

// Fast forward 1 week
let fastForward = async function() {
  let oldTime = (await web3.eth.getBlock(await web3.eth.blockNumber)).timestamp;
  await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [804800], id: 0});
  await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0});
  let currTime = (await web3.eth.getBlock(await web3.eth.blockNumber)).timestamp;
  let diff = (currTime - oldTime) - 804800;
  assert.isBelow(diff, 3, "Block time was not fast forwarded by 1 week");
};

// start a new exit
// checks that it succeeds
let startNewExit = async function(rootchain, sender, amount, minExitBond, blockNum, txPos, confirmSignature, txBytes) {
  let exitSigs = Buffer.alloc(130).toString('hex') + confirmSignature.slice(2) + Buffer.alloc(65).toString('hex');
  await rootchain.startExit(txPos, toHex(txBytes),
      toHex(proofForDepositBlock), toHex(exitSigs), {from: sender, value: minExitBond });
  let priority = 1000000000 * blockNum;
  let exit = await rootchain.getExit.call(priority);
  assert.equal(exit[0], sender, "Incorrect exit owner");
  assert.equal(exit[1], amount, "Incorrect amount");
  assert.equal(exit[2][0], blockNum, "Incorrect block number");
};

// starts a new failed exit
// checks that it fails
let startFailedExit = async function(rootchain, sender, amount, minExitBond, blockNum, txPos, confirmSignature, txBytes) {
  let exitSigs = Buffer.alloc(130).toString('hex') + confirmSignature.slice(2) + Buffer.alloc(65).toString('hex');
  let err;
  [err] = await to(rootchain.startExit(txPos, toHex(txBytes),
      toHex(proofForDepositBlock), toHex(exitSigs), {from: sender, value: amount }));
  if (!err) {
      assert.fail("Exit did not fail.");
  }
};

// finalize exits
// checks that it succeeds
let successfulFinalizeExit = async function(rootchain, sender, authority, blockNum, amount, minExitBond, success) {
  // finalize
  let oldBal = (await rootchain.getBalance.call({from: sender})).toNumber();
  let oldChildChainBalance = (await rootchain.childChainBalance()).toNumber();
  await rootchain.finalizeExits({from: authority});

  // exit prority
  let priority = 1000000000 * blockNum;

  exit = await rootchain.getExit.call(priority);
  if (success) {
    // check that the exit is successfully removed from the PQ
    assert.equal(exit[0], 0, "Exit was not deleted after finalizing");
  } else {
    // check that the exit hasn't been removed from the PQ
    assert.notEqual(exit[0], 0, "Exit should not have been was processed");
  }

  let balance = (await rootchain.getBalance.call({from: sender})).toNumber();
  if (success) {
    // check that the correct amount has been deposited into the account's balance
    assert.equal(balance, oldBal + minExitBond + amount, "Account's rootchain balance was not credited");
  } else {
    // check that nothing has been deposited into the account's balance
    assert.equal(balance, oldBal, "Account's rootchain balance should stay the same");
  }

  let contractBalance = (await web3.eth.getBalance(rootchain.address)).toNumber();
  let childChainBalance = (await rootchain.childChainBalance()).toNumber();
  if (success) {
    // check that the child chain balance has been updated correctly
    assert.equal(childChainBalance, oldChildChainBalance - minExitBond - amount, "Child chain balance was not updated correctly");
  } else {
    // check that the child chain balance has not changed
    assert.equal(childChainBalance, oldChildChainBalance, "Child chain balance should stay the same");
  }

  return [balance, contractBalance, childChainBalance];
};

// withdraw funds
// checks that it succeeds
let successfulWithdraw = async function(rootchain, sender, balance, contractBalance, childChainBalance) {
  await rootchain.withdraw({from: sender});
  let finalBalance = (await rootchain.getBalance.call({from: sender})).toNumber();
  // check that the balance is now 0 since the funds have been sent
  assert.equal(finalBalance, 0, "Balance was not updated");

  // check that the funds have been transfered
  let finalContractBalance = (await web3.eth.getBalance(rootchain.address)).toNumber();
  assert.equal(finalContractBalance, contractBalance - balance, "Funds were not transfered");

  // check that the child chain balance is not affected
  let finalChildChainBalance = (await rootchain.childChainBalance()).toNumber();
  assert.equal(finalChildChainBalance, childChainBalance, "totalWithdrawBalance was not updated correctly");
}

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

var rootchainHelpers = {
    createAndDepositTX: createAndDepositTX,
    submitValidDeposit: submitValidDeposit,
    submitInvalidDeposit: submitInvalidDeposit,
    submitBlockCheck: submitBlockCheck,
    startNewExit: startNewExit,
    startFailedExit: startFailedExit,
    successfulFinalizeExit: successfulFinalizeExit,
    successfulWithdraw: successfulWithdraw,
};

module.exports = rootchainHelpers;
