### PLASMA MVP WIP

We're implementing the [Minimum Viable Plasma](https://ethresear.ch/t/minimal-viable-plasma/426)

This is the MVP Plasma repo for Blockchain @ Berkeley's Plasma team. 
It currently relies heavily on David Knott's MVP: https://github.com/omisego/plasma-mvp

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

``make``

The MVP requires Solidity 0.4.18.

How to run Plasma MVP:

1. Start root chain with: ``ganache-cli -m=plasma_mvp``
2. Deploy contract to the root chain with:
``make root-chain``
3. Start the child chain server with:
``make child-chain``
4. Start the client with:
``omg start``

Note: Validations need to be added to the child chain as right now it accepts invalid transactions.

Now let's play around a bit:
1. We'll start by depositing with: ``deposit 100 3bb369fecdc16b93b99514d8ed9c2e87c5824cf4a6a98d2e8e91b7dd0c063304``
2. Then we'll send a tx with: ``send_tx 1 0 0 0 0 0 0xfd02ecee62797e75d86bcff1642eb0844afb28c7 50 0x4b3ec6c9dc67079e82152d6d55d8dd96a8e6aa26 45 5 3bb369fecdc16b93b99514d8ed9c2e87c5824cf4a6a98d2e8e91b7dd0c063304``
3.  Next we'll submit the block with: ``submit_block 3bb369fecdc16b93b99514d8ed9c2e87c5824cf4a6a98d2e8e91b7dd0c063304``
4. Now we'll withdraw our original deposit, double spending:
``withdraw 1 0 0 3bb369fecdc16b93b99514d8ed9c2e87c5824cf4a6a98d2e8e91b7dd0c063304``
Note: The functionality to challenge double spends from the cli is still being worked on.
5. Now we'll sync with the child chain (the deposit and the block we just submitted) locally with: ``sync``
6. And finally we'll close the client with: `ctrl c`
````

To run tests:
    ``make test``
