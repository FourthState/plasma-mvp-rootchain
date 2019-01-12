pragma solidity ^0.5.0;

import "./ECDSA.sol";
import "./BytesUtil.sol";

library Validator {
    using BytesUtil for bytes;
    using ECDSA for bytes32;

    // @param txHash      transaction hash
    // @param rootHash    block header of the merkle tree
    // @param input1      indicator for the second input
    // @param sigs        transaction signatures
    // @notice            when one input is present, we require it to be the first input by convention
    function checkSignatures(bytes32 txHash, bytes32 confirmationHash, bool input1,
                             bytes memory sig0, bytes memory sig1, bytes memory confirmSignatures)
        internal
        pure
        returns (bool)
    {
        require(sig0.length == 65 && sig1.length == 65, "signatures must be 65 bytes in length");

        if (input1) {
            require(confirmSignatures.length == 130, "two confirm signatures required with two inputs");

            address recoveredAddr0 = txHash.recover(sig0);
            address recoveredAddr1 = txHash.recover(sig1);

            return recoveredAddr0 == confirmationHash.recover(confirmSignatures.slice(0, 65))
                   && recoveredAddr1 == confirmationHash.recover(confirmSignatures.slice(65, 65))
                   && recoveredAddr0 != address(0) && recoveredAddr1 != address(0);
        }

        // only 1 input present
        require(confirmSignatures.length == 65, "one confirm signature required with one input present");

        address recoveredAddr = txHash.recover(sig0);
        return recoveredAddr == confirmationHash.recover(confirmSignatures) && recoveredAddr != address(0);
    }
}
