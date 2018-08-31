# PLASMA MVP Rootchain Documentation
## RootChain.sol
**function** `RootChain()`  
Contract constructor that sets the validator of the child chain.  

**function** `submitBlock(bytes32 root)`  
The validator submits the merkle root of a child chain block.  
`@param bytes32 root`: merkle root of the child chain  

**function** `deposit(uint blocknum, bytes txBytes)`  
Sender can deposit Eth into the smart contract, which will become redeemable on the child chain.  
`@param uint blocknum`: the current child chain block number  
`@param bytes txBytes`: the transaction bytes of the deposit, which is an RLP-encoded list of 15 elements

**function** `startExit(uint256[3] txPos, bytes txBytes, bytes proof, bytes sigs)`  
Begins the exit procedure for exiting a utxo on the child chain. The function checks that the inputs are valid, that this exit hasn't been finalized or challenged before, and that the sender has bonded funds to this exit. Then, it adds the exit to the priority queue.  
`@param uint256 txPos[0]`: plasma block number in which the transaction occured  
`@param uint256 txPos[1]`: transaction Index within the block  
`@param uint256 txPos[2]`: output Index within the transaction (either 0 or 1)  
`@param bytes txBytes`: transaction bytes of the utxo  
`@param bytes proof`: merkle proof of transaction's existence in the child chain block; should be 512-bytes long (the concatenation of 16 hashes, each 32 bytes long)  
`@param bytes sigs`: bytes 0-65 is the signature over the first input; bytes 65-130 is the signature over the second input; bytes 130-195 is the first confirmation signature; bytes 195-260 is the second confirmation signature  

**function** `challengeExit(uint256[3] txPos, uint256[3] newTxPos, bytes txBytes, bytes proof, bytes sigs, bytes confirmationSig)`  
Challenge an exit that's currently in the priority queue. A successful challenge results in the sender receiving the exit bond as a reward.  
`@param uint256 txPos [0]`: plasma block number in which the challenger's transaction occured  
`@param uint256 txPos [1]`: transaction index within the block  
`@param uint256 txPos [2]`: output index within the transaction (either 0 or 1)  
`@param uint256 newTxPos`: same as the above but the pos of the uxto created by the spend transaction  
`@param bytes proof`: merkle proof of transaction's existence in the child chain block; should be 512-bytes long (the concatenation of 16 hashes, each 32 bytes long)  
`@param bytes sigs`: bytes 0-65 is the signature over the first input; bytes 65-130 is the signature over the second input; bytes 130-195 is the first confirmation signature; bytes 195-260 is the second confirmation signature  
`@param bytes confirmationSig`: the confirm sig confirming that the sender acknowledges the spend of the utxo  

**function** `finalizeExits()`  
Process all "finalized" exits in the priority queue. "Finalized" exits are those that have been in the priority queue for at least one week and have not been proven to be faulty through a challengeExit. The function will also halt once the child chain balance is too low.  

**function** `withdraw()`  
Sender withdraws all funds associated with their balance from the contract. Separating funds allocation and funds transfers prevents a bad address from halting the priority queue.  

**function** `getDepositBlock()`  
Returns the next deposit block number.  
`@return` next deposit block number  

**function** `getChildChain(uint256 blockNumber)`  
Returns the merkle root and creation time of a child chain block.  
`@param uint256 blockNumber`: the block number of the child chain  
`@return` child chian merkle root and creation time  

**function** `getExit(uint256 priority)`  
Returns the contents of any attempted exit.  
`@param uint256 priority`: priority associated with the exit  
`@return` owner, amount, utxo position, creation time  

**function** `childChainBalance()`  
Returns the amount of funds that are currently on the child chain, which equals the total contract balance - the amount allocated for withdrawal.  
`@return` balance of child chain  

**function** `getBalance()`  
Returns the balance of the sender, which is determined by successful challenges and exits.  
`@return` balance of msg.sender  
