var PriorityQueue = artifacts.require("PriorityQueue");
var PriorityQueue_Test = artifacts.require("PriorityQueue_Test");

async function doDeploy(deployer, accounts) {
    await deployer.deploy(PriorityQueue);
    await deployer.link(PriorityQueue, PriorityQueue_Test);
    await deployer.deploy(PriorityQueue_Test, {from: accounts[0]});
}

module.exports = (deployer, network, accounts) => {
    deployer.then(async () => {
        await doDeploy(deployer, accounts);
    });
};
