import hre from "hardhat";

import { deployMockNFTContract, deployMockYOPContract } from "./mock";
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
  "YOP_WALLET_ADDRESS",
];
verifyEnvVar(requireEnvVar);

const CHAIN_ID = hre.network.config.chainId;
const YOP_MAINNET_ADDRESS = "0xAE1eaAE3F627AAca434127644371b67B18444051";
const EMISSION_START_TIME = 1640995200; // 2022-1-1-00:00:00 GMT
let YOP_NFT_CONTRACT_ADDRESS = process.env.YOP_NFT_CONTRACT_ADDRESS;
let YOP_ADDRESS = YOP_MAINNET_ADDRESS;

// mainnet expects the real NFT contract
// testnet will deploy a mock NFT contract
if (CHAIN_ID === 1) {
  verifyEnvVar(["YOP_NFT_CONTRACT_ADDRESS"]);
}

async function main(): Promise<void> {
  // Deploy any needed Mocks
  if (CHAIN_ID !== 1) {
    YOP_NFT_CONTRACT_ADDRESS = await deployMockNFTContract();
    YOP_ADDRESS = await deployMockYOPContract(process.env.YOP_WALLET);
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

  await deployContract("YOPVaultRewards", true, [
    process.env.GOVERNANCE_ADDRESS,
    process.env.YOP_WALLET_ADDRESS,
    YOP_ADDRESS,
    EMISSION_START_TIME,
  ]);
  console.log(
    `Please run "npx hardhat rewards:set-yop-allowance --yop ${YOP_ADDRESS} --reward ${deployRecord.YOPVaultRewards.address} --allowance <ALLOWANCE_VALUE>" to set the allowance.`
  );

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
    deployRecord.YOPVaultRewards.address,
  ]);
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
