pragma solidity ^0.4.24;

import "./Validator.sol";

/*
* Used to proxy function calls to the Validator for testing
*/

contract Validator_Test {

  using Validator for bytes32;

  function checkMembership(bytes32 leaf, uint256 index, bytes32 rootHash, bytes proof)
      public
      pure
      returns (bool)
  {
      return leaf.checkMembership(index, rootHash, proof);
  }

  function checkSigs(bytes32 txHash, bytes32 confirmationHash, bool input1, bytes sigs, bytes confirmSignatures)
      public
      pure
      returns (bool)
  {
      require(sigs.length == 130, "two transcation signatures, 65 bytes each, are required");

      bytes[] memory sigList;

      bytes memory sig0 = slice(sigs, 0, 65);
      if (input1) {
          bytes memory sig1 = slice(sigs, 65, 65);

          sigList = new bytes[](2);
          sigList[0] = sig0;
          sigList[1] = sig1;
      } else {
          sigList = new bytes[](1);
          sigList[0] = sig0;
      }
      return txHash.checkSigs(confirmationHash, input1, sigList, confirmSignatures);
  }

  function recover(bytes32 hash, bytes sig)
      public
      pure
      returns (address)
  {
      return hash.recover(sig);
  }

  function slice(bytes _bytes, uint start, uint len)
      public
      pure
      returns (bytes)
  {
      return Validator.slice(_bytes, start, len);
  }
}
