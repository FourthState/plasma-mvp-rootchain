# PLASMA MVP

[![travis build](https://img.shields.io/travis/FourthState/plasma-mvp-rootchain.svg)](https://travis-ci.org/FourthState/plasma-mvp-rootchain)
[![license](https://img.shields.io/github/license/FourthState/plasma-mvp-rootchain.svg)](https://github.com/FourthState/plasma-mvp-rootchain/blob/master/LICENSE)

We're implementing [Minimum Viable Plasma](https://ethresear.ch/t/minimal-viable-plasma/426)

This is the Rootchain contract repository for Blockchain @ Berkeley's Plasma team. This repository was originally forked from Omisego's [MVP](https://github.com/omisego/plasma-mvp), but has been significantly changed since. 

**Note**: Our current implementation assumes the child chain uses Proof of Authority, but we plan to allow for multiple validators in the near future.  

## Overview
Plasma is a layer 2 scaling solution which conducts transaction processing off chain and allows for only merkle roots of each block to be reported to a root chain. This allows for users to benefit from off chain scaling while still relying on decentralized security. 

The root contract of a Plasma child chain represents an intermediary who can resolve any disputes. The root contract is responsible for maintaining a mapping from block number to merkle root, processing deposits, and processing withdrawals. 

## Root Contract Details
A transaction is encoded in the following form:

``[Blknum1, TxIndex1, Oindex1, Amount1, ConfirmSig1,``

``Blknum2, TxIndex2, Oindex2, Amount2, ConfirmSig2,``

``NewOwner, Denom1, NewOwner, Denom2, Fee]``


``submitBlock``: Validator(s) submits merkle root of the current block

``deposit``: Users will deposit onto the child chain by calling ``deposit()``. Deposits are stored into a priority queue and processed upon the next call of ``submitBlock()``. **Note**: If a validator decides to never call submitBlock again, users with pending deposits will still be able to withdraw their deposit

``startExit``: When a user decides to exit for any reason, they will call ``startExit()`` and their pending exit will be added to a priority queue that has a 1 week challenge period. This function requires a bond. 

``challengeExit``: If any users notice an invalid withdrawal attempt, they may challenge this exit by providing the relevant information. If their challenge is successful, they will be awarded the bond associated with the exit attempt. 

``finalizeExits``: This function will finalize any pending exits that have been in the priority queue for longer than a week. If the exit attempt has not been invalidated by a successful challenge then it will be eligible for withdrawal. 

``withdraw``: Allows users to withdraw any balance that avaliable after the successful processing of an exit. 

## Setup
Install dependencies with:

``npm install``

**Note**: requires Solidity 0.4.18.

How to run Plasma MVP:

1. Start ganache-cli: ``ganache-cli -m=plasma_mvp``
2. Deploy contract to the root chain with: ``truffle migrate``

To run tests:
    ``npm test``