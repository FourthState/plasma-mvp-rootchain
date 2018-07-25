pragma solidity ^0.4.24;
import "./ByteUtils.sol";
import "openzeppelin-solidity/contracts/ECRecovery.sol";


/*
* All validation requirements.
* All functions act on the bytes32 data type.
*/
library Validator {
    using ECRecovery for bytes32;

    function recover(bytes32 hash, bytes sig)
        internal
        pure
        returns (address)
    {
        hash = hash.toEthSignedMessageHash();
        return hash.recover(sig);
    }

    // function checkSigs(bytes32 txHash, bytes32 rootHash,  uint256 blknum1, uint256 blknum2, bytes sigs)
    //     internal
    //     view
    //     returns (bool)
    // {
    //     require(sigs.length % 65 == 0 && sigs.length <= 260);
    //     bytes memory sig1 = ByteUtils.slice(sigs, 0, 65);
    //     bytes memory sig2 = ByteUtils.slice(sigs, 65, 65);
    //     bytes memory confSig1 = ByteUtils.slice(sigs, 130, 65);
    //     bytes32 confirmationHash = keccak256(abi.encodePacked(txHash, sig1, sig2, rootHash));

    //     // prefix the hashes correctly.
    //     txHash = txHash.toEthSignedMessageHash();
    //     confirmationHash = confirmationHash.toEthSignedMessageHash();
        
    //     if (blknum1 == 0 && blknum2 == 0) {
    //         return msg.sender == confirmationHash.recover(confSig1);
    //     }
    //     bool check1 = true;
    //     bool check2 = true;
        
    //     if (blknum1 > 0) {
    //         check1 = txHash.recover(sig1) == confirmationHash.recover(confSig1);
    //     } 
    //     if (blknum2 > 0) {
    //         bytes memory confSig2 = ByteUtils.slice(sigs, 195, 65);
    //         check2 = txHash.recover(sig2) == confirmationHash.recover(confSig2);
    //     }
    //     return check1 && check2;
    // }

    function checkMembership(bytes32 leaf, uint256 index, bytes32 rootHash, bytes proof)
        internal
        pure
        returns (bool)
    {
        require(proof.length == 512);
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
}
