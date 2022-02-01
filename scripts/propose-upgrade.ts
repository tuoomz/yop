import path from "path";
import hre from "hardhat";
import yargs from "yargs/yargs";
import { existsSync, readFileSync } from "fs";
import { readDeploymentFile, writeDeploymentFile, verifyEnvVar } from "./util";
import { proposeTxn } from "./gnosis/propose-txn";
const requireEnvVar = ["ETHERSCAN_API_KEY", "ALCHEMY_API_KEY"];
verifyEnvVar(requireEnvVar);

const argv = yargs(process.argv.slice(2))
  .options({
    env: { type: "string", default: "", describe: "the environment id" },
    "current-contract": { type: "string", default: "", describe: "the name of the current deployed contract" },
    "new-contract": { type: "string", default: "", describe: "the name of the new contract to upgrade to" },
    "abi-path": { type: "string", default: "", describe: "the relative path to the ABI file of the current contract" },
    governance: { type: "string", default: "", describe: "the multisig wallet address of the governance" },
  })
  .parseSync();

async function main(): Promise<void> {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const env = argv.env;
  if (!env) {
    throw new Error("no environment found");
  }
  const currentContractName: string = argv.currentContract;
  if (!currentContractName) {
    throw new Error("no current contract name");
  }
  const newContractName: string = argv.newContract;
  if (!newContractName) {
    throw new Error("no new contract name");
  }
  let abiPath: string = argv.abiPath;
  if (!abiPath) {
    throw new Error("no abi path");
  }
  abiPath = path.resolve(__dirname, abiPath);
  if (!existsSync(abiPath)) {
    throw new Error("can not load abi from at " + abiPath);
  }
  const abi = JSON.parse(readFileSync(abiPath, "utf-8"));
  const governance = argv.governance;
  if (!governance) {
    throw new Error("no governance multisig wallet");
  }

  console.log(`Deploying contracts as ${deployerAddress}`);

  let deployRecord = await readDeploymentFile(env);
  console.log(`Preparing ${newContractName} contract.`);

  const newFactory = await ethers.getContractFactory(newContractName);

  const currentContract = deployRecord[currentContractName].address;
  const upgrade = await hre.upgrades.prepareUpgrade(currentContract, newFactory);
  deployRecord[currentContractName].implementation = upgrade;

  console.log(`Deployed new implementation contract ${newContractName} - address: ${upgrade}`);

  deployRecord = {
    ...deployRecord,
    [newContractName]: {
      address: currentContract, // proxy address
      implementationAddress: upgrade,
      proposedUpgrade: true,
    },
  };

  await writeDeploymentFile(env, deployRecord);
  console.log(`New contract is deployed, proposing a multisig transaction to upgrade the proxy using safe ${governance}.`);
  await proposeTxn(governance, currentContract, "upgradeTo", `["${upgrade}"]`, "", hre, abi);
  console.log(`Transaction proposed, once it's approved in the safe the upgrade is completed.`);
  console.log(`Use the multisig safe to configure the new upgraded contract if needed.`);
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
