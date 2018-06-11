var RootChain = artifacts.require("RootChain");
var PriorityQueue = artifacts.require("PriorityQueue");

module.exports = function(deployer, network, accounts) {
    deployer.deploy(PriorityQueue);
    deployer.deploy(RootChain, {from: accounts[0]});
};
  
