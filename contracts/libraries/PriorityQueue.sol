pragma solidity ^0.4.24;

// external modules
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

// This queue implementation expects the `heapList` to always have
// a zero'th element. This is for indexing reasons.
//      For example: An empty `heapList` can be the array, [0].
library PriorityQueue {
    using SafeMath for uint256;

    function insert(uint256[] storage heapList, uint256 k)
        public
    {
        heapList.push(k);
        uint size = currentSize(heapList);
        if (size > 1) {
            percUp(heapList, size);
        }
    }

    function getMin(uint256[] storage heapList)
        public
        view
        returns (uint256)
    {
        require(currentSize(heapList) > 0, "empty queue");
        return heapList[1];
    }

    function delMin(uint256[] storage heapList)
        public
        returns (uint256)
    {
        uint size = currentSize(heapList);
        require(size > 0, "empty queue");

        uint256 retVal = heapList[1];

        heapList[1] = heapList[size];
        delete heapList[size];
        heapList.length = size; // not `size - 1` due to the unused first element
        size = size.sub(1);

        if (size > 1) {
            percDown(heapList, 1);
        }

        return retVal;
    }

    function minChild(uint256[] storage heapList, uint256 i)
        private
        view
        returns (uint256)
    {
        uint size = currentSize(heapList);
        if (i.mul(2).add(1) > size) {
            return i.mul(2);
        } else {
            if (heapList[i.mul(2)] < heapList[i.mul(2).add(1)]) {
                return i.mul(2);
            } else {
                return i.mul(2).add(1);
            }
        }
    }

    function percUp(uint256[] storage heapList, uint256 i)
        private
    {
        uint256 j = i;
        uint256 newVal = heapList[i];
        while (newVal < heapList[i.div(2)]) {
            heapList[i] = heapList[i.div(2)];
            i = i.div(2);
        }
        if (i != j) heapList[i] = newVal;
    }

    function percDown(uint256[] storage heapList, uint256 i)
        private
    {
        uint256 j = i;
        uint256 newVal = heapList[i];
        uint256 mc = minChild(heapList, i);
        uint256 size = currentSize(heapList);
        while (mc <= size && newVal > heapList[mc]) {
            heapList[i] = heapList[mc];
            i = mc;
            mc = minChild(heapList, i);
        }
        if (i != j) heapList[i] = newVal;
    }

    function currentSize(uint256[] storage heapList)
        internal
        view
        returns (uint256)
    {
        return heapList.length.sub(1);
    }
}
