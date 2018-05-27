# PLASMA MVP Rootchain Documentation
## RootChain.sol
**function** `RootChain()` </br>

**function** `submitBlock(bytes32 root)` </br>

**function** `deposit(uint blocknum, bytes txBytes)` </br>

**function** `getDepositBlock()` </br>

**function** `getChildChain(uint256 blockNumber)` </br>

**function** `getExit(uint256 priority)` </br>

**function** `startExit(uint256[3] txPos, bytes txBytes, bytes proof, bytes sigs)` </br>

**function** `challengeExit(uint256[3] txPos, uint256[3] newTxPos, bytes txBytes, bytes proof, bytes sigs, bytes confirmationSig)` </br>

**function** `finalizeExits()` </br>

**function** `childChainBalance()` </br>

**function** `getBalance()` </br>

**function** `withdraw()` </br>
