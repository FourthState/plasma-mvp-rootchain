let PlasmaMVP = artifacts.require("PlasmaMVP");

let TMSimpleMerkleTree = artifacts.require("TMSimpleMerkleTree");
let TMSimpleMerkleTree_Test = artifacts.require("TMSimpleMerkleTree");

let MinPriorityQueue = artifacts.require("MinPriorityQueue");
let MinPriorityQueue_Test = artifacts.require("MinPriorityQueue_Test");


module.exports = function(deployer, network, accounts) {
    // deploy public libraries
    deployer.deploy(TMSimpleMerkleTree);
    deployer.deploy(MinPriorityQueue);

    // linking
    deployer.link(TMSimpleMerkleTree, [PlasmaMVP, TMSimpleMerkleTree_Test]);
    deployer.link(MinPriorityQueue, [PlasmaMVP, MinPriorityQueue_Test]);

    // deploy plasma mvp
	deployer.deploy(PlasmaMVP, {from: accounts[0]});
};
