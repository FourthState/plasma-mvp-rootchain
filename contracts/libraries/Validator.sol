pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/ECRecovery.sol";

library Validator {
    // @param leaf     a leaf of the tree
    // @param index    position of this leaf in the tree that is zero indexed
    // @param rootHash block header of the merkle tree
    // @param proof    sequence of hashes from the leaf to check against the root 
    function checkMembership(bytes32 leaf, uint256 index, bytes32 rootHash, bytes proof)
        internal
        pure
        returns (bool)
    {
        // depth 16 merkle tree
        require(proof.length == 512, "Incorrect proof length");

        bytes32 proofElement;
        bytes32 computedHash = leaf;

        for (uint256 i = 32; i <= 512; i += 32) {
            assembly {
                proofElement := mload(add(proof, i))
            }
            if (index % 2 == 0) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
            index = index / 2;
        }
        return computedHash == rootHash;
    }

    // @param txHash      transaction hash
    // @param rootHash    block header of the merkle tree
    // @param input0      indicator for nonzero first input
    // @param input1      indicator for nonzero second input
    // @param sigs        transaction signatures
    function checkSigs(bytes32 txHash, bytes32 confirmationHash, bool input0, bool input1, bytes sigs, bytes confirmSignatures)
        internal
        pure
        returns (bool)
    {
        require(sigs.length == 130, "two transaction signatures required");
        require(confirmSignatures.length == 130, "two confirm signatures required");
        bytes memory sig0 = slice(sigs, 0, 65);
        bytes memory sig1 = slice(sigs, 65, 65);
        bytes memory confSig0 = slice(confirmSignatures, 0, 65);
        
        bool check0 = true;
        bool check1 = true;
        if (input0) {
            check0 = recover(txHash, sig0) == recover(confirmationHash, confSig0);
        } 
        if (input1) {
            bytes memory confSig1 = slice(confirmSignatures, 65, 65);
            check1 = recover(txHash, sig1) == recover(confirmationHash, confSig1);
        }
        return check0 && check1;
    }

    function recover(bytes32 hash, bytes sig)
        internal
        pure
        returns (address)
    {
        
        hash = ECRecovery.toEthSignedMessageHash(hash);
        return ECRecovery.recover(hash, sig);
    }

    /* Helpers */

    // TODO: Re-implement this
    // @param _bytes raw bytes that needs to be slices
    // @param start  start of the slice relative to `_bytes`
    // @param len    length of the sliced byte array
    function slice(bytes _bytes, uint start, uint len)
            internal
            pure
            returns (bytes)
        {
            
            bytes memory tempBytes;
            
            assembly {
                tempBytes := mload(0x40)
                
                let lengthmod := and(len, 31)
                
                let mc := add(tempBytes, lengthmod)
                let end := add(mc, len)
                
                for {
                    let cc := add(add(_bytes, lengthmod), start)
                } lt(mc, end) {
                    mc := add(mc, 0x20)
                    cc := add(cc, 0x20)
                } {
                    mstore(mc, mload(cc))
                }
                
                mstore(tempBytes, len)
                
                //update free-memory pointer
                //allocating the array padded to 32 bytes like the compiler does now
                mstore(0x40, and(add(mc, 31), not(31)))
            }
            
            return tempBytes;
    }
}
