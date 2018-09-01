var RootChain = artifacts.require("RootChain");
var PriorityQueue = artifacts.require("PriorityQueue");

async function doDeploy(deployer, accounts) {
    await deployer.deploy(PriorityQueue);
    await deployer.link(PriorityQueue, RootChain);
    await deployer.deploy(RootChain, {from: accounts[0]});
}

module.exports = (deployer, network, accounts) => {
    deployer.then(async () => {
        await doDeploy(deployer, accounts);
    });
};
