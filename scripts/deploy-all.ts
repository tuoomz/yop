// This is our game day deploy script. It will deploy all our known contracts together (big bang)

import hre, { ethers } from "hardhat";
import { fetchConstant } from "../constants";

import { SingleAssetVault } from "../types/SingleAssetVault";
import { YOPVaultRewards } from "../types/YOPVaultRewards";
import { VaultStrategyDataStore, BaseStrategy, CurveEth } from "../types";
import { AccessControlManager } from "../types/AccessControlManager";

import { readDeploymentFile, verifyEnvVar, spaces, address, isDevelopmentNetwork } from "./util";
import { deployContract } from "./deploy-contract";

import { VAULTS } from "../deployment-config/vaults";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const requireEnvVar = ["ETHERSCAN_API_KEY", "ALCHEMY_API_KEY", "REWARDS_ADDRESS", "YOP_WALLET_ADDRESS"];
verifyEnvVar(requireEnvVar);

const CHAIN_ID = hre.network.config.chainId;
const EMISSION_START_TIME = 1640995200; // 2022-1-1-00:00:00 GMT

const deployedArtifacts: Record<string, string> = {};
deployedArtifacts[">>>>> DEPLOYED ARTIFACTS <<<<<"] = "";

async function getRolesAddresses(): Promise<Record<string, SignerWithAddress | string>> {
  let GOVERNANCE;
  let GATEKEEPER;
  let STRATEGIST;
  let HARVESTER;

  if (isDevelopmentNetwork()) {
    [, GOVERNANCE, GATEKEEPER, STRATEGIST, HARVESTER] = await ethers.getSigners();
  }
  if (hre.network.name === "mainnet") {
    // These are our MULTISIG gnosis-safe wallets. Env Var can be used to override for development
    GOVERNANCE = fetchConstant("multisig", "yopGovernance");
    GATEKEEPER = fetchConstant("multisig", "yopGatekeeper");
    STRATEGIST = fetchConstant("multisig", "yopStrategist");
    HARVESTER = fetchConstant("multisig", "yopHarvester");
  }
  const YOP = fetchConstant("addresses", "yop_address");
  const YOP_NFT_CONTRACT = fetchConstant("addresses", "yop_nft_contract_address");

  return {
    GOVERNANCE,
    GATEKEEPER,
    STRATEGIST,
    HARVESTER,
    YOP,
    YOP_NFT_CONTRACT,
  };
}
interface DeployedInfra {
  accounts: { GOVERNANCE: SignerWithAddress | string };
  vaultStrategyDataStores: {
    VaultStrategyDataStore: VaultStrategyDataStore;
  };
  vaults: {
    STABLE: SingleAssetVault;
    ETH: SingleAssetVault;
  };
  strategies: {
    CurveEth: CurveEth;
  };
}
// async function main(): Promise<Record<string, Contract | Record<string, BaseStrategy | SingleAssetVault>>> {
async function main(): Promise<DeployedInfra> {
  const { GOVERNANCE, GATEKEEPER, STRATEGIST, HARVESTER, YOP, YOP_NFT_CONTRACT } = await getRolesAddresses();
  const deployRecord = await readDeploymentFile();

  console.log("\nStarting contract deployments\n");

  // Start AllowListAccessControl Contract Deploy
  await deployContract("AllowlistAccess", "AllowlistAccessControl", false, address(GOVERNANCE));

  // Start ERC1155AccessControl Contract Deploy
  await deployContract("ERC1155Access", "ERC1155AccessControl", false, address(YOP_NFT_CONTRACT), address(GOVERNANCE));

  // Start AccessControlManager Contract Deploy
  const accessControlManager = await deployContract<AccessControlManager>("AccessControl", "AccessControlManager", false, address(GOVERNANCE));
  deployedArtifacts.accessControlManager = accessControlManager.address;

  // Start VaultStrategyDataStore Contract Deploy
  const vaultStrategyDataStore = await deployContract<VaultStrategyDataStore>(
    "VaultStrategyDataStore",
    "VaultStrategyDataStore",
    false,
    address(GOVERNANCE)
  );
  deployedArtifacts.vaultStrategyDataStore = vaultStrategyDataStore.address;

  const YOPVaultRewards = await deployContract<YOPVaultRewards>("YOPVaultRewards", "YOPVaultRewards", true, [
    address(GOVERNANCE),
    process.env.YOP_WALLET_ADDRESS,
    address(YOP),
    EMISSION_START_TIME,
  ]);
  deployedArtifacts.YOPVaultRewards = YOPVaultRewards.address;
  deployedArtifacts[`${spaces(2)}hint`] = `Please run 
  "npx hardhat rewards:set-yop-allowance \\
  --yop ${address(YOP)} \\
  --reward ${YOPVaultRewards.address} \\
  --allowance <ALLOWANCE_VALUE>" 
  to set the allowance.`;

  console.log(`
    Please run "npx hardhat rewards:set-yop-allowance --yop ${address(YOP)} --reward ${
    YOPVaultRewards.address
  } --allowance <ALLOWANCE_VALUE>" to set the allowance.
    `);

  console.log("\nStarting Vault and Strategies Deployments\n");
  deployedArtifacts.vaults = "";

  const deployedVaults: Record<string, SingleAssetVault> = {};
  const deployedStrategies: Record<string, BaseStrategy> = {};

  for (const key in VAULTS) {
    const vaultName = VAULTS[key].name;
    const vaultSymbol = VAULTS[key].symbol;
    const vaultToken = VAULTS[key].vault_token;
    const vaultType = VAULTS[key].vault_type;
    // Start Vault Contract Deploy
    const vault = await deployContract<SingleAssetVault>(key, vaultType, true, [
      vaultName,
      vaultSymbol,
      address(GOVERNANCE),
      address(GATEKEEPER),
      // todo move to constant once known
      process.env.REWARDS_ADDRESS,
      vaultStrategyDataStore.address,
      vaultToken,
      accessControlManager.address,
      YOPVaultRewards.address,
    ]);
    deployedVaults[vaultName] = vault;
    deployedArtifacts[`${spaces(2)}${vaultName}`] = vault.address;

    for await (const strategy of VAULTS[key].strategies) {
      console.log(`\nStarting ${strategy.name} Strategy Deployments\n`);
      const strategyName = strategy.name;

      const strategyParams = strategy.additionalConstructorArgs;

      // Start strategy Contract Deploy
      // This is assuming a certain order for strategy constructor params
      // vault address, strategist, rewards address, harvester and any other params that are passed via the config file
      const strategyContract = await deployContract<BaseStrategy>(
        strategyName,
        strategyName,
        false,
        vault.address,
        address(STRATEGIST),
        process.env.REWARDS_ADDRESS,
        address(HARVESTER),
        ...strategyParams
      );
      deployedStrategies[strategyName] = strategyContract;
      deployedArtifacts[`${spaces(4)}${strategyName}`] = strategyContract.address;
    }
  }

  // log artifacts
  Object.keys(deployedArtifacts).forEach((artifact) => console.log(`${artifact}: ${deployedArtifacts[artifact]}`));
  return {
    accounts: { GOVERNANCE },
    vaultStrategyDataStores: {
      VaultStrategyDataStore: vaultStrategyDataStore,
    },
    vaults: {
      STABLE: deployedVaults.STABLE,
      ETH: deployedVaults.ETH,
    },
    strategies: {
      CurveEth: deployedStrategies.CurveEth as CurveEth,
    },
  };
}

async function activateEnvironment(deployedContracts: DeployedInfra): Promise<void> {
  console.log(">>>>>activateEnvironment");
  const { accounts, vaultStrategyDataStores, vaults, strategies } = deployedContracts;
  const GOVERNANCE = accounts.GOVERNANCE;
  const vaultStrategyDataStore = vaultStrategyDataStores.VaultStrategyDataStore;
  const ethVault = vaults.ETH;
  const curveEthStrategy = strategies.CurveEth;
  await vaultStrategyDataStore
    .connect(GOVERNANCE)
    .addStrategy(ethVault.address, curveEthStrategy.address, 9000, ethers.constants.Zero, ethers.constants.MaxUint256, 100);
  console.log(">>>>>Added CurveEth to ETH Vault");
  await ethVault.connect(GOVERNANCE).unpause();
  console.log(">>>>>Unpaused ETH Vault");
}

main()
  .then(async (deployedContracts) => {
    if (isDevelopmentNetwork()) {
      await activateEnvironment(deployedContracts);
    }
  })
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
