pragma solidity ^0.4.24;

// external modules
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

library PriorityQueue {
    function insert(uint256[] storage heapList, uint256 k)
        public
    {
        heapList.push(k);
        uint size = heapList.length;
        if (size > 1)
            precUp(heapList(size - 1);
    }

    function getMin(uint256[] storage heapList)
        public
        view
        returns (uint256)
    {
        require(heapList.length > 0, "empty queue");

        return heapList[0];
    }

    function delMin(uint256[] storage heapList)
        public
        returns (uint256)
    {
        require(heapList.length > 0, "empty queue");

        uint256 min = heapList[0];
        if (heapList.length > 1) { // the minimum can be the only element in the heap
            // move the largest element in the heap to the top and percDown
            heapList[0] = heapList[heapList.length - 1];
            delete heapList[size];
            heapList.length = heapList.length - 1;

            if (heapList.length > 1)
                percDown(heapList, 0);
        }

        return min;
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
