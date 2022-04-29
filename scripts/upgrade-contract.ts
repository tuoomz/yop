import { readDeploymentFile, writeDeploymentFile } from "./util";
import hre from "hardhat";
import { Options } from "@openzeppelin/hardhat-upgrades/dist/utils";
import { Libraries } from "hardhat/types";
import { ContractFunctionCall, Wallet } from "./lib/ContractDeployment";
import upgradeableABI from "../abi/@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol/UUPSUpgradeable.json";
const { ethers } = hre;
const NETWORK_NAME = hre.network.name;

let totalGasUsed = 0;

export function resetTotalGasUsed() {
  totalGasUsed = 0;
}

export function getTotalGasUsed() {
  return totalGasUsed;
}

export async function upgradeContract(
  env: string = NETWORK_NAME,
  name: string,
  version: string,
  contractName: string,
  libraries?: Libraries,
  signer?: Wallet
): Promise<ContractFunctionCall> {
  if (!signer) {
    throw new Error(`no signer specified for the upgrade`);
  }
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log(`Upgrading deployment ${name} as ${deployerAddress}`);

  const deployRecords = await readDeploymentFile(env);
  const currentContract = deployRecords[name].address;
  if (!currentContract) {
    throw new Error(`no current deployment found with name ${name}`);
  }
  const factory = await ethers.getContractFactory(contractName, { libraries: libraries });
  const opts: Options = {};
  if (libraries) {
    opts.unsafeAllow = ["external-library-linking"];
  }
  // there are no parameters to pass to an upgrade, but sometimes there are additional configurations needed after an upgrade.
  // so use the `update` flag to compare the current deployed contract status vs the desired contract status and generate the configuration calls that are needed
  const upgradedAddress = await hre.upgrades.prepareUpgrade(currentContract, factory, opts);
  console.log(`Version ${version} for ${name} is deployed at ${upgradedAddress}`);
  deployRecords[name].implementationAddress = upgradedAddress;
  deployRecords[name].version = version;
  deployRecords.implementations = deployRecords.implementations || {};
  if (!deployRecords.implementations[upgradedAddress]) {
    console.log(`New implementation contract is deployed at ${upgradedAddress}`);
    // there is no good way to get the used gas of the upgrade transaction as HardHat doesn't surface the transaction
    // so we do an estimation of the contract deployment instead. Not completely accurate but good enough.
    const deployTrans = await factory.getDeployTransaction();
    const gas = await ethers.provider.estimateGas(deployTrans);
    console.log(`Estimated gas = ${gas}`);
    totalGasUsed += gas.toNumber();
    deployRecords.implementations[upgradedAddress] = {
      contract: contractName,
      address: upgradedAddress,
      version: version,
      estimatedGas: gas,
    };
  } else {
    console.log(`Implementation contract is already deployed at address ${upgradedAddress}`);
  }
  await writeDeploymentFile(env, deployRecords);
  return {
    address: currentContract,
    abi: upgradeableABI,
    methodName: "upgradeTo",
    params: [upgradedAddress],
    signer: signer!,
  };
}
