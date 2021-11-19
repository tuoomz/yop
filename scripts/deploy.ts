import hre from "hardhat";

import { TransactionResponse } from "@ethersproject/abstract-provider";
import { deployMockNFTContract } from "./mock";

import { AllowlistAccessControl, ERC1155AccessControl, VaultStrategyDataStore, SingleAssetVault } from "../types";

import AllowListAccessControlArtifact from "../artifacts/contracts/access/AllowListAccessControl.sol/AllowlistAccessControl.json";
import ERC1155AccessControlArtifact from "../artifacts/contracts/access/ERC1155AccessControl.sol/ERC1155AccessControl.json";
import AccessControlManagerArtifact from "../artifacts/contracts/access/AccessControlManager.sol/AccessControlManager.json";
import VaultStrategyDataStoreArtifact from "../artifacts/contracts/vaults/VaultStrategyDataStore.sol/VaultStrategyDataStore.json";
import SingleAssetVaultArtifact from "../artifacts/contracts/vaults/SingleAssetVault.sol/SingleAssetVault.json";

import { readDeploymentFile, writeDeploymentFile, verifyEnvVar } from "./util";
import { AccessControlManager } from "../types/AccessControlManager";

const requireEnvVar = [
  "ETHERSCAN_API_KEY",
  "ALCHEMY_API_KEY",
  "GOVERNANCE_ADDRESS",
  "GATEKEEPER_ADDRESS",
  "REWARDS_ADDRESS",
  "VAULT_NAME",
  "VAULT_SYMBOL",
  "VAULT_TOKEN",
];
verifyEnvVar(requireEnvVar);

const CHAIN_ID = hre.network.config.chainId;

let YOP_NFT_CONTRACT_ADDRESS = process.env.YOP_NFT_CONTRACT_ADDRESS;

// mainnet expects the real NFT contract
// testnet will deploy a mock NFT contract
if (CHAIN_ID === 1) {
  verifyEnvVar(["YOP_NFT_CONTRACT_ADDRESS"]);
}

async function main(): Promise<void> {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log(`Deploying contracts as ${deployerAddress}`);

  // Deploy any needed Mocks
  if (CHAIN_ID !== 1) {
    YOP_NFT_CONTRACT_ADDRESS = await deployMockNFTContract();
  }

  let deployRecord = await readDeploymentFile();

  /*
   *
   * Start AllowListAccessControl Contract Deploy
   *
   * */

  console.log("Deploying AllowlistAccessControl contract");
  const AllowlistAccessControlFactory = await ethers.getContractFactory("AllowlistAccessControl");
  const AllowlistAccessControlContract: AllowlistAccessControl = (await AllowlistAccessControlFactory.deploy(
    process.env.GOVERNANCE_ADDRESS
  )) as AllowlistAccessControl;

  console.log(`Deploying AllowlistAccessControl contract - txHash: ${AllowlistAccessControlContract.deployTransaction.hash}`);
  await AllowlistAccessControlContract.deployed();

  deployRecord = {
    ...deployRecord,
    AllowlistAccessControl: {
      address: AllowlistAccessControlContract.address,
      abi: AllowListAccessControlArtifact,
      deployTransaction: await getTxn(AllowlistAccessControlContract.deployTransaction),
    },
  };

  await writeDeploymentFile(deployRecord);
  console.log(
    `AllowListAccess deployed - txHash: ${AllowlistAccessControlContract.deployTransaction.hash} - address: ${AllowlistAccessControlContract.address}`
  );

  /*
   *
   * Start ERC1155AccessControl Contract Deploy
   *
   * */

  console.log("Deploying ERC1155AccessControl contract");
  const ERC1155AccessControlFactory = await ethers.getContractFactory("ERC1155AccessControl");
  const ERC1155AccessControlContract: ERC1155AccessControl = (await ERC1155AccessControlFactory.deploy(
    YOP_NFT_CONTRACT_ADDRESS,
    process.env.GOVERNANCE_ADDRESS
  )) as ERC1155AccessControl;

  console.log(`Deploying ERC1155AccessControl contract - txHash: ${ERC1155AccessControlContract.deployTransaction.hash}`);
  await ERC1155AccessControlContract.deployed();

  deployRecord = {
    ...deployRecord,
    ERC1155AccessControl: {
      address: ERC1155AccessControlContract.address,
      abi: ERC1155AccessControlArtifact,
      deployTransaction: await getTxn(ERC1155AccessControlContract.deployTransaction),
    },
  };

  await writeDeploymentFile(deployRecord);
  console.log(
    `ERC1155AccessControl deployed - txHash: ${ERC1155AccessControlContract.deployTransaction.hash} - address: ${ERC1155AccessControlContract.address}`
  );

  console.log("Deploying AccessControlManager contract");
  const AccessControlManagerFactory = await ethers.getContractFactory("AccessControlManager");
  const AccessControlManagerContract: AccessControlManager = (await AccessControlManagerFactory.deploy(
    process.env.GOVERNANCE_ADDRESS
  )) as AccessControlManager;

  console.log(`Deploying AccessControlManager contract - txHash: ${AccessControlManagerContract.deployTransaction.hash}`);
  await AccessControlManagerContract.deployed();

  deployRecord = {
    ...deployRecord,
    AccessControlManager: {
      address: AccessControlManagerContract.address,
      abi: AccessControlManagerArtifact,
      deployTransaction: await getTxn(AccessControlManagerContract.deployTransaction),
    },
  };

  await writeDeploymentFile(deployRecord);
  console.log(
    `AccessControlManager deployed - txHash: ${AccessControlManagerContract.deployTransaction.hash} - address: ${AccessControlManagerContract.address}`
  );

  /*
   *
   * Start VaultStrategyDataStore Contract Deploy
   *
   * */

  console.log("Deploying VaultStrategyDataStore contract");
  const VaultStrategyDataStoreFactory = await ethers.getContractFactory("VaultStrategyDataStore");
  const VaultStrategyDataStoreContract: VaultStrategyDataStore = (await VaultStrategyDataStoreFactory.deploy(
    process.env.GOVERNANCE_ADDRESS
  )) as VaultStrategyDataStore;

  console.log(`Deploying VaultStrategyDataStore contract - txHash: ${VaultStrategyDataStoreContract.deployTransaction.hash}`);
  await VaultStrategyDataStoreContract.deployed();

  deployRecord = {
    ...deployRecord,
    VaultStrategyDataStore: {
      address: VaultStrategyDataStoreContract.address,
      abi: VaultStrategyDataStoreArtifact,
      deployTransaction: await getTxn(VaultStrategyDataStoreContract.deployTransaction),
    },
  };

  await writeDeploymentFile(deployRecord);
  console.log(
    `VaultStrategyDataStore deployed - txHash: ${VaultStrategyDataStoreContract.deployTransaction.hash} - address: ${VaultStrategyDataStoreContract.address}`
  );

  /*
   *
   * Start SingleAssetVault Contract Deploy
   *
   * */

  console.log("Deploying SingleAssetVault contract proxy");
  const SingleAssetVaultFactory = await ethers.getContractFactory("SingleAssetVault");
  const params = [
    process.env.VAULT_NAME,
    process.env.VAULT_SYMBOL,
    process.env.GOVERNANCE_ADDRESS,
    process.env.GATEKEEPER_ADDRESS,
    process.env.REWARDS_ADDRESS,
    VaultStrategyDataStoreContract.address,
    process.env.VAULT_TOKEN,
    AccessControlManagerContract.address,
  ];
  const SingleAssetVaultContract: SingleAssetVault = (await hre.upgrades.deployProxy(SingleAssetVaultFactory, params, {
    kind: "uups",
  })) as SingleAssetVault;

  console.log(`Deploying SingleAssetVault contract proxy - txHash: ${SingleAssetVaultContract.deployTransaction.hash}`);
  await SingleAssetVaultContract.deployed();

  deployRecord = {
    ...deployRecord,
    SingleAssetVault: {
      address: SingleAssetVaultContract.address,
      abi: SingleAssetVaultArtifact,
      deployTransaction: await getTxn(SingleAssetVaultContract.deployTransaction),
    },
  };

  await writeDeploymentFile(deployRecord);
  console.log(
    `SingleAssetVault proxy deployed - txHash: ${SingleAssetVaultContract.deployTransaction.hash} - address: ${SingleAssetVaultContract.address}`
  );
}

async function getTxn(transactionResponse: TransactionResponse) {
  const txn = await transactionResponse.wait();
  return {
    ...transactionResponse,
    ...txn,
    gasPrice: transactionResponse.gasPrice?.toString(),
    gasLimit: transactionResponse.gasLimit.toString(),
    value: transactionResponse.value.toString(),
    gasUsed: txn.gasUsed.toString(),
    cumulativeGasUsed: txn.cumulativeGasUsed.toString(),
  };
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
