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
    // @param blknum1     block number of the first input
    // @param blknum2     block number of the sceond input
    // @param sigs        transaction signatures
    function checkSigs(bytes32 txHash, bytes32 rootHash,  uint256 blknum1, uint256 blknum2, bytes sigs)
        internal
        pure
        returns (bool)
    {
        require(sigs.length % 65 == 0 && sigs.length == 260);
        bytes memory sig1 = slice(sigs, 0, 65);
        bytes memory sig2 = slice(sigs, 65, 65);
        bytes memory confSig1 = slice(sigs, 130, 65);
        bytes32 confirmationHash = keccak256(abi.encodePacked(txHash, sig1, sig2, rootHash));
        
        bool check1 = true;
        bool check2 = true;
        // existence of input 1
        if (blknum1 > 0) {
            check1 = recover(txHash, sig1) == recover(confirmationHash, confSig1);
        } 
        // existence of input 2
        if (blknum2 > 0) {
            bytes memory confSig2 = slice(sigs, 195, 65);
            check2 = recover(txHash, sig2) == recover(confirmationHash, confSig2);
        }
        return check1 && check2;
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
