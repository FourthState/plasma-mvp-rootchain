var RootChain = artifacts.require("RootChain");
var Trap = artifacts.require("Trap");

module.exports = function(deployer) {
    deployer.deploy(RootChain);
    deployer.deploy(Trap);
  };
  