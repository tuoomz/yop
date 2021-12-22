// This is our game day deploy script. It will deploy all our known contracts together (big bang)

import hre from "hardhat";
import { fetchConstant } from "../constants";

import { readDeploymentFile, verifyEnvVar } from "./util";
import { deployContract } from "./deploy-contract";

import { VAULTS } from "../deployment-config/vaults";

// These are our MULTISIG gnosis-safe wallets. Env Var can be used to override for development
const GOVERNANCE_ADDRESS = process.env.GOVERNANCE_ADDRESS || fetchConstant("multisig", "yopGovernance");
const GATEKEEPER_ADDRESS = process.env.GATEKEEPER_ADDRESS || fetchConstant("multisig", "yopGatekeeper");
const STRATEGIST_ADDRESS = process.env.GATEKEEPER_ADDRESS || fetchConstant("multisig", "yopStrategist");
const KEEPER_ADDRESS = process.env.KEEPER_ADDRESS || fetchConstant("multisig", "yopKeeper");

const YOP_ADDRESS = process.env.YOP_ADDRESS || fetchConstant("addresses", "yop_address");
const YOP_NFT_CONTRACT_ADDRESS = process.env.YOP_NFT_CONTRACT_ADDRESS || fetchConstant("addresses", "yop_nft_contract_address");

const requireEnvVar = ["ETHERSCAN_API_KEY", "ALCHEMY_API_KEY", "REWARDS_ADDRESS", "YOP_WALLET_ADDRESS"];
verifyEnvVar(requireEnvVar);

const CHAIN_ID = hre.network.config.chainId;
const EMISSION_START_TIME = 1640995200; // 2022-1-1-00:00:00 GMT

async function main(): Promise<void> {
  const deployRecord = await readDeploymentFile();

  console.log("\nStarting contract deployments\n");

  // Start AllowListAccessControl Contract Deploy
  await deployContract("AllowlistAccess", "AllowlistAccessControl", false, GOVERNANCE_ADDRESS);

  // Start ERC1155AccessControl Contract Deploy
  await deployContract("ERC1155Access", "ERC1155AccessControl", false, YOP_NFT_CONTRACT_ADDRESS, GOVERNANCE_ADDRESS);

  // Start AccessControlManager Contract Deploy
  const accessControlManager = await deployContract("AccessControl", "AccessControlManager", false, GOVERNANCE_ADDRESS);

  // Start VaultStrategyDataStore Contract Deploy
  const vaultStrategyDataStore = await deployContract("VaultStrategyDataStore", "VaultStrategyDataStore", false, GOVERNANCE_ADDRESS);

  const YOPVaultRewards = await deployContract("YOPVaultRewards", "YOPVaultRewards", true, [
    process.env.GOVERNANCE_ADDRESS,
    process.env.YOP_WALLET_ADDRESS,
    YOP_ADDRESS,
    EMISSION_START_TIME,
  ]);

  console.log(`
    Please run "npx hardhat rewards:set-yop-allowance --yop ${YOP_ADDRESS} --reward ${YOPVaultRewards.address} --allowance <ALLOWANCE_VALUE>" to set the allowance.
    `);

  console.log("\nStarting Vault and Strategies Deployments\n");
  for (const key in VAULTS) {
    const vaultName = VAULTS[key].name;
    const vaultSymbol = VAULTS[key].symbol;
    const vaultToken = VAULTS[key].vault_token;
    const vaultType = VAULTS[key].vault_type;

    // Start Vault Contract Deploy
    const vault = await deployContract(key, vaultType, true, [
      vaultName,
      vaultSymbol,
      GOVERNANCE_ADDRESS,
      GATEKEEPER_ADDRESS,
      // todo move to constant once known
      process.env.REWARDS_ADDRESS,
      vaultStrategyDataStore.address,
      vaultToken,
      accessControlManager.address,
      YOPVaultRewards.address,
    ]);

    for await (const strategy of VAULTS[key].strategies) {
      const strategyName = strategy.name;
      const strategyParams = strategy.additionalConstructorArgs;

      // Start strategy Contract Deploy
      // This is assuming a certain order for strategy constructor params
      // vault address, strategist, rewards address, keeper and any other params that are passed via the config file
      await deployContract(
        strategyName,
        strategyName,
        false,
        vault.address,
        STRATEGIST_ADDRESS,
        process.env.REWARDS_ADDRESS,
        KEEPER_ADDRESS,
        ...strategyParams
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
