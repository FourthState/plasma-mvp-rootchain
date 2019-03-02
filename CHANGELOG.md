# v1.0.0

First release of the Plasma MVP specification using ETH as the native currency. The contract allows for users to deposit funds which are assigned to a unique nonce.
These deposits can subsequently be spent on the plasma chain that is run by the operator. The operator also must publish block headers and metadata to the contract.
These committments can be batched into one call to save on gas fees. As in the original spec, this implementation relies on confim signatures to ensure trustlessness
between the users and operator. The confirm signatures are embedded into the txBytes upon spends to ensure data availability and are published with each exited output
with the exception of deposit exits. See [docs](https://github.com/FourthState/plasma-mvp-rootchain/blob/5f205fa5ca6e027843118412b155d46aad62fed1/docs/plasmaMVPFunctions.md) for a more detailed explanation of each function call. Our [research repository](https://github.com/fourthstate/plasma-research) has 
information about many of the design decisions in this implementation.

There are several improvements such as arbitrary ERC20 support that will be included in upcoming releases!

