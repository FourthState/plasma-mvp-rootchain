pragma solidity ^0.5.0;

import "./Validator.sol";

/*
* Used to proxy function calls to the Validator for testing
*/

contract Validator_Test {
  using Validator for bytes32;

  function checkSignatures(bytes32 txHash, bytes32 confirmationHash, bool input1, bytes memory sig0, bytes memory sig1, bytes memory confirmSignatures)
      public
      pure
      returns (bool)
  {
      return txHash.checkSignatures(confirmationHash, input1, sig0, sig1, confirmSignatures);
  }
}
