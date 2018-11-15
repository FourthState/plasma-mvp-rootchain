pragma solidity ^0.4.24;

import "./Validator.sol";

/*
* Used to proxy function calls to the Validator for testing
*/

contract Validator_Test {

  using Validator for bytes32;

  event ReceivedArgs(bytes32 leaf, uint256 index, bytes32 rootHash, uint256 total, bytes proof);

  event ProofElement(bytes32 proofElement);
  event LeftHash(bytes32 leftHash);
  event RightHash(bytes32 rightHash);
  event HashResult(bytes32 computedHash);

  function checkMembership(bytes32 leaf, uint256 index, bytes32 rootHash, bytes proof, uint256 total)
      public
      returns (bool)
  {
      // emit ReceivedArgs(leaf, index, rootHash, total, proof);

      // variable size Merkle tree, but proof must consist of 32-byte hashes
      require(proof.length % 32 == 0, "Incorrect proof length");

      bytes32 computedHash = computeHashFromAunts(index, total, leaf, proof);
      emit HashResult(computedHash);
      // require(computedHash == rootHash, "computedHash and rootHash not equal");
      return computedHash == rootHash;
  }

  function computeHashFromTwoHashes(bytes32 leftHash, bytes32 rightHash) 
    public
    returns (bytes32)
  {     
        emit LeftHash(leftHash);
        emit RightHash(rightHash);


        bytes memory b = new bytes(1);
        assembly {
            let memPtr := add(b, 0x20)
            mstore8(memPtr, 0x20)
        }

        bytes memory packed = abi.encodePacked(b, leftHash, b, rightHash);
        
        // emit Test(packed);

        bytes32 hashResult = sha256(packed);
        emit HashResult(hashResult);
        return hashResult;
  }

  function computeMerkleHashFromTxBytes(bytes txBytes) 
    public
  {
    bytes32 merkleHash = sha256(txBytes);
    // bytes32 merkleHash = keccak256(txBytes);
    emit HashResult(merkleHash);
  }

      // from https://tendermint.com/docs/spec/blockchain/encoding.html#simple-merkle-proof
    function computeHashFromAunts(uint256 index, uint256 total, bytes32 leaf, bytes innerHashes)
        internal
        returns (bytes32)
    {
        require(index < total, "Index must be less than total number of leaf nodes");
        require(total > 0, "Must have at least one leaf node");

        if (total == 1) {
            require(innerHashes.length == 0);
            return leaf;
        }
        require(innerHashes.length != 0);

        uint256 numLeft = (total + 1) / 2;
        bytes32 proofElement;

        // prepend 0x20 byte literal to hashes
        bytes memory b = new bytes(1);
        assembly {
            let memPtr := add(b, 0x20)
            mstore8(memPtr, 0x20)
        }

        if (index < numLeft) {
            bytes32 leftHash = computeHashFromAunts(index, numLeft, leaf, slice(innerHashes, 0, innerHashes.length - 32));

            uint innerHashesMemOffset = innerHashes.length - 32;
            assembly {
                // get the last 32-byte hash from innerHashes array
                proofElement := mload(add(add(innerHashes, 0x20), innerHashesMemOffset))
            }

            emit ProofElement(proofElement);
            emit LeftHash(leftHash);

            return sha256(abi.encodePacked(b, leftHash, b, proofElement));
            // return sha256(abi.encodePacked(leftHash, proofElement));
        }

        bytes32 rightHash = computeHashFromAunts(index-numLeft, total-numLeft, leaf, slice(innerHashes, 0, innerHashes.length - 32));
        innerHashesMemOffset = innerHashes.length - 32;
        assembly {
                // get the last 32-byte hash from innerHashes array
                proofElement := mload(add(add(innerHashes, 0x20), innerHashesMemOffset))
        }

        emit ProofElement(proofElement);
        emit RightHash(rightHash);
        return sha256(abi.encodePacked(b, proofElement, b, rightHash));
        // return sha256(abi.encodePacked(proofElement, rightHash));
    }

  function checkSigs(bytes32 txHash, bytes32 confirmationHash, bool input1, bytes sig0, bytes sig1, bytes confirmSignatures)
      public
      pure
      returns (bool)
  {
      return txHash.checkSigs(confirmationHash, input1, sig0, sig1, confirmSignatures);
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
