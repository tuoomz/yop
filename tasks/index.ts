import { task } from "hardhat/config";

import { createDelegate, listDelegates, deleteDelegate } from "../scripts/gnosis/safe-delegate";
export * as impersonateAccountsTask from "./fork/impersonateAccounts";
export * as distributeFundsTask from "./fork/distributeFunds";
export * as increaseTimeTsk from "./fork/increaseTime";
export * as resetFork from "./fork/reset";
export * as rewardsTask from "./rewards/approveRewardsContract";
export * as gnosisPropose from "./gnosis/propose-txn";
export * as gnosisCreate from "./gnosis/safe-create";
export * as kmsAddress from "./kms/kms-eth-address";

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

task("gnosis:add-delegate", "Adds an whitelisted address that can propose txn to a safe")
  .addParam("safe", "the safe address you to add a delegate to")
  .addParam("delegate", "delegates the address")
  .addOptionalParam("label", "Adds a label to the delegate", "proposer")
  .setAction(async (taskArguments, hre) => {
    const safe = taskArguments.safe;
    const delegate = taskArguments.delegate;
    const label = taskArguments.label;

    await createDelegate(safe, delegate, label, hre);
  });

task("gnosis:delete-delegate", "Removes whitelisted address that can propose txn.")
  .addParam("delegate", "delegates the address")
  .addParam("delegator", "current delegator, use list to find this")
  .setAction(async (taskArguments, hre) => {
    const delegator = taskArguments.delegator;
    const delegate = taskArguments.delegate;

    await deleteDelegate(delegate, delegator, hre);
  });

task("gnosis:list-delegates", "Lists all delegates for safe")
  .addParam("safe", "the safe address you to add a delegate to")
  .setAction(async (taskArguments, hre) => {
    const safe = taskArguments.safe;

    await listDelegates(safe, hre);
  });
