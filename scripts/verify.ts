import hre from "hardhat";
import { expect } from "chai";

import { readDeploymentFile, verifyEnvVar } from "./util";

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

async function main(): Promise<void> {
  const deployRecord = await readDeploymentFile();

  // Deploy any needed Mocks
  let YOP_NFT_CONTRACT_ADDRESS = process.env.YOP_NFT_CONTRACT_ADDRESS;
  const CHAIN_ID = hre.network.config.chainId;

  if (CHAIN_ID !== 1) {
    YOP_NFT_CONTRACT_ADDRESS = deployRecord.YopERC1155Mock.address;
  }

  // AllowlistAccessControl
  try {
    await hre.run("verify:verify", {
      address: deployRecord.AllowlistAccessControl.address,
      constructorArguments: [process.env.GOVERNANCE_ADDRESS],
    });
  } catch (error: any) {
    expect(error.message).contains("Already Verified");
  }

  // ERC1155AccessControl
  try {
    await hre.run("verify:verify", {
      address: deployRecord.ERC1155AccessControl.address,
      constructorArguments: [YOP_NFT_CONTRACT_ADDRESS, process.env.GOVERNANCE_ADDRESS],
    });
  } catch (error: any) {
    expect(error.message).contains("Already Verified");
  }

  // VaultStrategyDataStore
  try {
    await hre.run("verify:verify", {
      address: deployRecord.VaultStrategyDataStore.address,
      constructorArguments: [process.env.GOVERNANCE_ADDRESS],
    });
  } catch (error: any) {
    expect(error.message).contains("Already Verified");
  }

  // SingleAssetVault
  try {
    await hre.run("verify:verify", {
      address: deployRecord.SingleAssetVault.address,
      constructorArguments: [
        process.env.VAULT_NAME,
        process.env.VAULT_SYMBOL,
        process.env.GOVERNANCE_ADDRESS,
        process.env.GATEKEEPER_ADDRESS,
        process.env.REWARDS_ADDRESS,
        deployRecord.VaultStrategyDataStore.address,
        process.env.VAULT_TOKEN,
      ],
    });
  } catch (error: any) {
    expect(error.message).contains("Already Verified");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
