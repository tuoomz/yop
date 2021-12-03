import hre from "hardhat";

import { readDeploymentFile, writeDeploymentFile, getTxn } from "./util";

export async function deployContract(contractName: string, upgradeable: boolean, ...contractParams: any): Promise<void> {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log(`Deploying contracts as ${deployerAddress}`);

  let deployRecord = await readDeploymentFile();
  console.log(`Preparing ${contractName} contract with params: ${contractParams}`);

  const factory = await ethers.getContractFactory(contractName);
  let contract;
  if (upgradeable) {
    console.log(`Deploy ${contractName} as upgradeable contract`);
    contract = await hre.upgrades.deployProxy(factory, ...contractParams, {
      kind: "uups",
    });
  } else {
    console.log(`Deploy ${contractName} contract`);
    contract = await factory.deploy(...contractParams);
  }

  console.log(`Deploying ${contractName} contract - txHash: ${contract.deployTransaction.hash}`);
  await contract.deployed();

  deployRecord = {
    ...deployRecord,
    [contractName]: {
      address: contract.address,
      proxy: upgradeable,
      deployTransaction: await getTxn(contract.deployTransaction),
    },
  };

  if (upgradeable) {
    const implementationAddress = await hre.upgrades.erc1967.getImplementationAddress(contract.address);
    console.log("Contract implementation is:", implementationAddress);
    deployRecord[contractName].implementationAddress = implementationAddress;
  }
  await writeDeploymentFile(deployRecord);
  console.log(`${contractName} deployed - txHash: ${contract.deployTransaction.hash} - address: ${contract.address} \n\n`);
}
