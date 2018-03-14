### PLASMA MVP WIP

We're implementing the [Minimum Viable Plasma](https://ethresear.ch/t/minimal-viable-plasma/426)

This is the MVP Plasma rootchain contract repo for Blockchain @ Berkeley's Plasma team. 
Inspired by David Knott's MVP: https://github.com/omisego/plasma-mvp

Proposed Changes:
1. Use cosmos-sdk for the child chain implementation, eventually transition to running Tendermint consensus.
2. Create reward scheme to incentive fraud proofs from third-party.
3. Create fraud proofs for invalid blocks and slash block proposer's stake.

Current TODOs:
1. Refactor PrioirityQueue.sol to allow for parallel exit challenges.
2. Create reward scheme in RootContract.sol by rewarding successful challenger with exiter's bond.
3. Create withdraw method rather than forcing transfers.
4. Determine how to aggregate signatures from previous owners in startExit
5. Determine how to efficiently prove that block is invalid on-chain.
6. Enforce block ordering by proposer before block is sent to smart contract.

Install dependencies with:

``npm install``

The MVP requires Solidity 0.4.18.

How to run Plasma MVP:

1. Start ganache-cli: ``ganache-cli -m=plasma_mvp``
2. Deploy contract to the root chain with: ``truffle migrate``

To run tests:
    ``npm test``
