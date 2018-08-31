# PLASMA MVP Rootchain Documentation
## RootChain.sol

```solidity
function submitBlock(bytes32 root)
```
The validator submits the block header, `root` of each child chain block.  

<br >

```solidity
function deposit(address owner)
```
Entry point into the child chain. The user has the option to create a spendable utxo owned by the address, `owner`. Once created, the private keys of the `owner` address has complete control of the new utxo.

Deposits are not recorded in the child chain blocks and are entirely represented on the rootchain. Each deposit is identified with an incremental nonce. Validators catch deposits through event handlers and maintain a collection of spendable deposits.
```solidity
mapping(uint256 => depositStruct) deposits; // The key is the incrementing nonce
struct depositStruct {
    address owner;
    uint256 amount;
    uint256 created_at;
}
```

<br />

```solidity
function startExit(uint256[3] txPos, bytes txBytes, bytes proof, bytes sigs)
```
`txPos` follow the convention - `[blockNumber, transcationIndex, outputIndex]`  
Exit procedure for exiting a utxo on the child chain(not deposits). The `txPos` locates the transaction on the child chain. The leaf, hash(hash(`txBytes`), `sigs`) is checked against the block header using the `proof`.

A valid exit satisfies the following properties:
  - Exit has not previously been finalized or challenge
  - The creator of this exit posted a sufficient bond. Excess funds are refunded the the senders rootchain balance and are immediately withdrawable.

<br />

```solidity
function startDepositExit(uint256 nonce)
```
Exit procdure for deposits that have not been spent. Deposits are purely identified by their `nonce` which is all that is needed to start an exit. The caller's address must match the owner of the deposit.  
A valid exit must satisfy the same constraints listed above for normal utxo exits.

<br />

```solidity
function challengeExit(uint256[3] txPos, uint256[2] newTxPos, bytes txBytes, bytes proof, bytes sigs, bytes confirmSignature)
```
`txPos` and `newTxPos` follow the convention - `[blockNumber, transcationIndex, outputIndex]`  
A uxto that has starting an exit phase but was already spent on the child chain can be challenged using this function call. A successfull challenge awards the caller with the exit bond.  
The `txPos` locates the malicious utxo and is used to calculate the priority. `newTxPos` locates the transaction that is the parent (offending transaction is an input into this tx). The `proof`, `txBytes` and `sigs` is sufficient for a proof of inclusion in the child chain of
the parent transaction. The `confirmSignature`, signed by the owner of the malicious transaction, acknowledges the inclusion of it's parent in the plasma chain and allows anyone with this confirm signature to challenge a malicious exit of the child.

<br />

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
