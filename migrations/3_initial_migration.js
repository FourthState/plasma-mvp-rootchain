var PriorityQueue = artifacts.require("PriorityQueue");

module.exports = function(deployer) {
    deployer.deploy(PriorityQueue);
  };
  