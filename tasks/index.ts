import { task } from "hardhat/config";

task("gas-price", "Prints gas price").setAction(async function ({ address }, { ethers }) {
  console.log("Gas price", (await ethers.provider.getGasPrice()).toString());
});

task("_flatten", "TODO: should generate flat files for each contract").setAction(async function ({ address }, { ethers }) {
  console.log("TODO", (await ethers.provider.getGasPrice()).toString());
});

task("accounts", "Prints the list of accounts", async ({ ethers }) => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});
