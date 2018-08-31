# PLASMA MVP

[![travis build](https://travis-ci.org/FourthState/plasma-mvp-rootchain.svg?branch=master)](https://travis-ci.org/FourthState/plasma-mvp-rootchain)
[![license](https://img.shields.io/github/license/FourthState/plasma-mvp-rootchain.svg)](https://github.com/FourthState/plasma-mvp-rootchain/blob/master/LICENSE)
[![Coverage Status](https://coveralls.io/repos/github/FourthState/plasma-mvp-rootchain/badge.svg?branch=master)](https://coveralls.io/github/FourthState/plasma-mvp-rootchain?branch=master)

We're implementing [Minimum Viable Plasma](https://ethresear.ch/t/minimal-viable-plasma/426)

This is the Rootchain contract repository for Blockchain @ Berkeley's Plasma team.

## Overview
Plasma is a layer 2 scaling solution which conducts transaction processing off chain and allows for only merkle roots of each block to be reported to a root chain. This allows for users to benefit from off chain scaling while still relying on decentralized security.

The root contract of a Plasma child chain represents an intermediary who can resolve any disputes. The root contract is responsible for maintaining a mapping from block number to merkle root, processing deposits, and processing withdrawals.

## Root Contract Details
A transaction is encoded in the following form:

```
[Blknum1, TxIndex1, Oindex1, DepositNonce1, Amount1, ConfirmSig1

Blknum2, TxIndex2, Oindex2, DepositNonce2, Amount2, ConfirmSig2

NewOwner, Denom1, NewOwner, Denom2, Fee]
```


``submitBlock``: Validator(s) submits the merkle root of the current block

``deposit``: Entry point into the plasma chain. Deposits are not included in blocks on the plasma chain. They are represented entirely in the smart contract and kept track of with a nonce. Deposits fire events which Validators use to keep a collection of spendable deposits.

``startExit``: When a user decides to exit a utxo, their pending exit will be added to a queue that has a 1 week challenge period. A bond is required and the priority is dependent on the transaction location on the plasma chain.

``startDepositExit``: For a deposit not spent on the child chain, this used to exit deposits. These exits are inserted into a seperate queue with a 1 week challenge period. The priority for deposit exits is it's nonce.

``challengeExit``: In the case of an invalid utxo withdrawal attempt, users may challenge this exit by providing the relevant information. If their challenge is successful, they will be awarded the bond associated with the exit attempt

``challengeDepositExit``: If a deposit has been spent on the child chain, a transcation with this bad deposit as an input can be used to challenge the exit.

``finalizeExits``: Finalizes pending exits that have been in the priority queue for longer than a week.

``finalizeDepositExits``: Finalizes pending deposit exits in the deposit queue with the same conditions as above.

``withdraw``: Allows users to withdraw their balance that are avaliable after the successful processing of an exit or challenge.

### Documentation

See our [documentation](https://github.com/FourthState/plasma-mvp-rootchain/blob/master/docs/rootchainFunctions.md) 


### Contributing

See our [contribution guidelines](https://github.com/FourthState/plasma-mvp-rootchain/blob/master/CONTRIBUTING.md)
