let RLP = require('rlp');

let {
    catchError,
    toHex,
    waitForNBlocks,
    fastForward,
    proofForDepositBlock,
    zeroHashes
} = require('../utilities.js');

// Create a generic deposit
let createAndDepositTX = async function(rootchain, address, amount) {
    // submit a deposit
    let blockNum = (await rootchain.getDepositBlock.call()).toNumber();
    let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0, address, amount, 0, 0, 0]);
    let validatorBlock = await rootchain.currentChildBlock.call();
    await rootchain.deposit(validatorBlock, toHex(txBytes), {from: address, value: amount});

    // construct the confirm sig
    // Remove all 0x prefixes from hex strings
    let blockHeader = (await rootchain.getChildChain.call(blockNum))[0];
    let txHash = web3.sha3(txBytes.toString('hex'), {encoding: 'hex'});
    let sigs = Buffer.alloc(130).toString('hex');

    // create the confirm sig
    // let confirmHash = web3.sha3(txHash.slice(2) + sigs + blockHeader.slice(2), {encoding: 'hex'});
    // let confirmSignature = await web3.eth.sign(address, confirmHash);

    return [blockNum, txBytes, txHash, sigs, blockHeader];
};

// submit a valid deposit
// checks that it succeeds
let submitValidDeposit = async function(rootchain, sender, txBytes, amount) {
  let prevValidatorBlock = (await rootchain.currentChildBlock.call()).toNumber();
  let prevDepositBlock = (await rootchain.getDepositBlock.call()).toNumber();

  let result = await rootchain.deposit(prevValidatorBlock, toHex(txBytes), {from: sender, value: amount});

  let currValidatorBlock = (await rootchain.currentChildBlock.call()).toNumber();
  let currDepositBlock = (await rootchain.getDepositBlock.call()).toNumber();

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
  [err] = await catchError(rootchain.deposit(validatorBlock, toHex(txBytes), {from: sender, value: amount}));
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
  [err] = await catchError(rootchain.submitBlock(web3.fromAscii(blockRoot), {from: sender}));
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

// start a new exit
// checks that it succeeds
let startNewExit = async function(rootchain, sender, amount, minExitBond, blockNum, txPos, txBytes) {
  let exitSigs = Buffer.alloc(130).toString('hex');
  
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
let startFailedExit = async function(rootchain, sender, amount, minExitBond, blockNum, txPos, txBytes) {
  let exitSigs = Buffer.alloc(130).toString('hex');
  let err;
  [err] = await catchError(rootchain.startExit(txPos, toHex(txBytes),
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
};

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
