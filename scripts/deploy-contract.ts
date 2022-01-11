import hre from "hardhat";
import { readDeploymentFile, writeDeploymentFile, getTxn } from "./util";

export async function deployContract<Type>(name: string, contractFactory: string, upgradeable: boolean, ...contractParams: any): Promise<Type> {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log(`Deploying contracts as ${deployerAddress}`);

  let deployRecord = await readDeploymentFile();

  const deploymentRecordName = name;
  console.log(`Preparing ${deploymentRecordName} contract with params: ${contractParams}`);

  const factory = await ethers.getContractFactory(contractFactory);
  let contract;
  if (upgradeable) {
    console.log(`Deploy ${deploymentRecordName} as upgradeable contract`);
    contract = await hre.upgrades.deployProxy(factory, ...contractParams, {
      kind: "uups",
    });
  } else {
    console.log(`Deploy ${deploymentRecordName} contract`);
    contract = await factory.deploy(...contractParams);
  }

  console.log(`Deploying ${deploymentRecordName} contract - txHash: ${contract.deployTransaction.hash}`);
  await contract.deployed();

  deployRecord = {
    ...deployRecord,
    [deploymentRecordName]: {
      address: contract.address,
      proxy: upgradeable,
      deployTransaction: await getTxn(contract.deployTransaction),
      contractParams: contractParams,
    },
  };

  if (upgradeable) {
    const implementationAddress = await hre.upgrades.erc1967.getImplementationAddress(contract.address);
    console.log("Contract implementation is:", implementationAddress);
    deployRecord[deploymentRecordName].implementationAddress = implementationAddress;
  }
  await writeDeploymentFile(deployRecord);
  console.log(`${deploymentRecordName} deployed - txHash: ${contract.deployTransaction.hash} - address: ${contract.address} \n\n`);

  // return contract;
  const res = contract as unknown as Type;
  return res;
}
