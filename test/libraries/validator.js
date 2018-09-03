let assert = require('chai').assert;

let Validator_Test = artifacts.require("Validator_Test");
let { catchError, toHex } = require('../utilities.js');

contract('Validator', async (accounts) => {
    let instance;
    before (async () => {
        instance = await Validator_Test.new({from: accounts[0]});
    });

    it("Test checkMembership", async () => {
        let input_seed = "input_seed";
        console.log(toHex(input_seed));
    })

    it("Test Slice", async () => {
        let input_seed = "input_seed";
        console.log(toHex(input_seed));
    })
});
