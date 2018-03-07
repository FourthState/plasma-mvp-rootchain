var RootChain = artifacts.require("RootChain");

contract('RootChain', accounts => {
    it("Submit block from authority passes", accounts => {
        return RootChain.deployed().then(instance => {
            instance.submitBlock()
        })
    })
})

