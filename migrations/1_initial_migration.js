let Migrations = artifacts.require("Migrations");

let PriorityQueue = artifacts.require("PriorityQueue");
let PriorityQueue_Test = artifacts.require("PriorityQueue_Test");

let Validator = artifacts.require("Validator");
let Validator_Test = artifacts.require("Validator_Test");

let TMSimpleMerkleTree = artifacts.require("TMSimpleMerkleTree");

let RootChain = artifacts.require("RootChain");

module.exports = function(deployer, network, accounts) {
    deployer.deploy(Migrations);
    // deploy libraries which have no internal functions
    deployer.deploy([PriorityQueue, TMSimpleMerkleTree, Validator], {from: accounts[0]}).then(() => {
        deployer.link(PriorityQueue, [PriorityQueue_Test, RootChain]);
        deployer.link(Validator, [Validator_Test, RootChain]);
        deployer.link(TMSimpleMerkleTree, [RootChain]);
    });
};
