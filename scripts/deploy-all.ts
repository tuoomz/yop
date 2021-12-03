import hre from "hardhat";

import { deployMockNFTContract } from "./mock";
import { readDeploymentFile, verifyEnvVar } from "./util";
import { deployContract } from "./deploy-contract";

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
  // Deploy any needed Mocks
  if (CHAIN_ID !== 1) {
    YOP_NFT_CONTRACT_ADDRESS = await deployMockNFTContract();
  }

  const deployRecord = await readDeploymentFile();

  // Start AllowListAccessControl Contract Deploy
  await deployContract("AllowlistAccessControl", false, process.env.GOVERNANCE_ADDRESS);

  // Start ERC1155AccessControl Contract Deploy
  await deployContract("ERC1155AccessControl", false, YOP_NFT_CONTRACT_ADDRESS, process.env.GOVERNANCE_ADDRESS);

  // Start AccessControlManager Contract Deploy
  await deployContract("AccessControlManager", false, process.env.GOVERNANCE_ADDRESS);

  // Start VaultStrategyDataStore Contract Deploy
  await deployContract("VaultStrategyDataStore", false, process.env.GOVERNANCE_ADDRESS);

  // Start SingleAssetVault Contract Deploy
  await deployContract("SingleAssetVault", true, [
    process.env.VAULT_NAME,
    process.env.VAULT_SYMBOL,
    process.env.GOVERNANCE_ADDRESS,
    process.env.GATEKEEPER_ADDRESS,
    process.env.REWARDS_ADDRESS,
    deployRecord.VaultStrategyDataStore.address,
    process.env.VAULT_TOKEN,
    deployRecord.AccessControlManager.address,
  ]);
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
