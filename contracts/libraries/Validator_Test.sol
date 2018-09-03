pragma solidity ^0.4.24;

import "./Validator.sol";

/*
* Used to proxy function calls to the Validator for testing
*/

contract Validator_Test {

  using Validator for bytes32;

  function checkMembership(bytes32 leaf, uint256 index, bytes32 rootHash, bytes proof)
      public
      returns (bool)
  {
      return leaf.checkMembership(index, rootHash, proof);
  }

  function checkSigs(bytes32 txHash, bytes32 confirmationHash, bool input0, bool input1, bytes sigs, bytes confirmSignatures)
      public
      returns (bool)
  {
      return txHash.checkSigs(confirmationHash, input0, input1, sigs, confirmSignatures);
  }

  function recover(bytes32 hash, bytes sig)
      public
      returns (address)
  {
      return hash.recover(sig);
  }

  /* function slice(bytes _bytes, uint start, uint len)
      public
      returns (bytes)
  {
      return Validator.slice(_bytes, start, len);
  } */
}
