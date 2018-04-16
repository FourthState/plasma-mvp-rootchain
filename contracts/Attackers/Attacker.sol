pragma solidity ^0.4.18;

import '../RootChain/RootChain.sol';

contract Attacker {

    RootChain rootChain;

    uint256 public balance;

    function Attacker(address rootChainAddr)
        payable
        public
    {
      rootChain = RootChain(rootChainAddr);
      balance = msg.value;
    }

    /// @param root 32 byte merkleRoot of ChildChain block
    /// @notice childChain blocks can only be submitted at most every 6 root chain blocks
    function submitBlock(bytes32 root)
        public
    {
        rootChain.submitBlock(root);
    }

    /// @dev txBytes Length 11 RLP encoding of Transaction excluding signatures
    /// @notice owner and value should be encoded in Output 1
    /// @notice hash of txBytes is hashed with a empty signature
    function deposit(uint blocknum, bytes txBytes)
        public
        payable
    {
        rootChain.deposit(blocknum, txBytes);
    }

    function getDepositBlock()
        public
        view
        returns (uint256)
    {
        return rootChain.getDepositBlock();
    }

    function getChildChain(uint256 blockNumber)
        public
        view
        returns (bytes32, uint256)
    {
        return rootChain.getChildChain(blockNumber);
    }

    function getExit(uint256 priority)
        public
        view
        returns (address, uint256, uint256[3], uint256)
    {
        return rootChain.getExit(priority);
    }

    /// @param txPos [0] Plasma block number in which the transaction occured
    /// @param txPos [1] Transaction Index within the block
    /// @param txPos [2] Output Index within the transaction (either 0 or 1)
    /// @param sigs First 130 bytes are signature of transaction and the rest is confirm signature
    /// @notice Each signature is 65 bytes
    function startExit(uint256[3] txPos, bytes txBytes, bytes proof, bytes sigs)
        public
        payable
        returns (uint256)
    {
        rootChain.startExit(txPos, txBytes, proof, sigs);
    }

    /// @param txPos [0] Plasma block number in which the challenger's transaction occured
    /// @param txPos [1] Transaction Index within the block
    /// @param txPos [2] Output Index within the transaction (either 0 or 1)
    /// @param newTxPos  Same as the above but the pos of the uxto created by the spend tx
    function challengeExit(uint256[3] txPos, uint256[3] newTxPos, bytes txBytes, bytes proof, bytes sigs, bytes confirmationSig)
        public
    {
        rootChain.challengeExit(txPos, newTxPos, txBytes, proof, sigs, confirmationSig);
    }

    function finalizeExits()
        public
    {
        rootChain.finalizeExits();
    }

    function getBalance()
          public
          view
          returns (uint256)
    {
        return rootChain.getBalance();
    }

    function withdraw()
        public
        returns (uint256)
    {
        return rootChain.withdraw();
    }

    function () payable public {
        revert();
    }
}
