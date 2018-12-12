let Migrations = artifacts.require("Migrations");

let PriorityQueue = artifacts.require("PriorityQueue");
let PriorityQueue_Test = artifacts.require("PriorityQueue_Test");

let Validator = artifacts.require("Validator");
let Validator_Test = artifacts.require("Validator_Test");

let TMSimpleMerkleTree = artifacts.require("TMSimpleMerkleTree");
let TMSimpleMerkleTree_Test = artifacts.require("TMSimpleMerkleTree_Test");

let PlasmaMVP = artifacts.require("PlasmaMVP");

module.exports = function(deployer, network, accounts) {
    deployer.deploy(Migrations);

    // deploy and link libraries
    deployer.deploy([PriorityQueue, TMSimpleMerkleTree, Validator], {from: accounts[0]}).then(() => {
        deployer.link(PriorityQueue, [PriorityQueue_Test, PlasmaMVP]);
        deployer.link(Validator, [Validator_Test, PlasmaMVP]);
        deployer.link(TMSimpleMerkleTree, [TMSimpleMerkleTree_Test, PlasmaMVP]);
    });
};
