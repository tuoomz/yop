import { DeployOptions } from "@openzeppelin/hardhat-upgrades/dist/utils";
import hre from "hardhat";
import { Libraries } from "hardhat/types";
import { readDeploymentFile, writeDeploymentFile, getTxn } from "./util";

const NETWORK_NAME = hre.network.name;
const PROXY_DEPLOY_GAS = 672671;

let totalGasUsed = 0;

export function resetTotalGasUsed() {
  totalGasUsed = 0;
}

export function getTotalGasUsed() {
  return totalGasUsed;
}

export async function deployContract<Type>(
  env: string = NETWORK_NAME,
  name: string,
  contractFactory: string,
  upgradeable: boolean,
  version: string,
  libraries?: Libraries,
  initializer?: string,
  ...contractParams: any
): Promise<Type> {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log(`Deploying contracts as ${deployerAddress}`);

  let deployRecord = await readDeploymentFile(env);

  const deploymentRecordName = name;
  console.log(`Preparing ${deploymentRecordName} contract with params: ${contractParams}`);

  const factory = await ethers.getContractFactory(contractFactory, { libraries: libraries });
  const options: DeployOptions = { kind: "uups", initializer: initializer };
  if (libraries) {
    options.unsafeAllow = ["external-library-linking"];
  }
  let contract;
  if (upgradeable) {
    console.log(`Deploy ${deploymentRecordName} as upgradeable contract`);
    contract = await hre.upgrades.deployProxy(factory, contractParams, options);
  } else {
    console.log(`Deploy ${deploymentRecordName} contract`);
    contract = await factory.deploy(...contractParams);
  }

  console.log(`Deploying ${deploymentRecordName} contract - txHash: ${contract.deployTransaction.hash}`);
  await contract.deployed();

  const deployTrans = await getTxn(contract.deployTransaction);
  if (deployTrans.gasUsed) {
    console.log(`Deploying ${deploymentRecordName} contract - gas used: ${deployTrans.gasUsed}`);
    totalGasUsed += parseInt(deployTrans.gasUsed);
  }

  deployRecord = {
    ...deployRecord,
    [deploymentRecordName]: {
      address: contract.address,
      proxy: upgradeable,
      deployTransaction: deployTrans,
      contractParams: contractParams,
      version: version,
    },
  };

  if (upgradeable) {
    const implementationAddress = await hre.upgrades.erc1967.getImplementationAddress(contract.address);
    console.log("Contract implementation is:", implementationAddress);
    deployRecord[deploymentRecordName].implementationAddress = implementationAddress;
    // a proxy contract deployment will cost this much gas
    totalGasUsed += PROXY_DEPLOY_GAS;
  }
  await writeDeploymentFile(env, deployRecord);
  console.log(`${deploymentRecordName} deployed - txHash: ${contract.deployTransaction.hash} - address: ${contract.address} \n\n`);

  // return contract;
  const res = contract as unknown as Type;
  return res;
}
