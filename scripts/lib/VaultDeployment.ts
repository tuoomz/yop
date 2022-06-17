import {
  ContractDeploymentUpdate,
  ContractDeploymentCall,
  ContractFunctionCall,
  Wallet,
  DeploymentRecord,
  DeployCommonArgs,
  BaseConfig,
} from "./ContractDeployment";
import VaultABI from "../../abi/contracts/vaults/SingleAssetVaultV2.sol/SingleAssetVaultV2.json";
import BaseStrategyABI from "../../abi/contracts/strategies/BaseStrategy.sol/BaseStrategy.json";
import { ethers } from "hardhat";
import { readDeploymentFile } from "../util";
import { CurveStrategyDeploymentConfig, CurveV1StrategyDeployment } from "./strategies/CurveV1StrategyDeployment";
import { VaultStrategyDataStoreDeployment } from "./VaultStrategyDataStoreDeployment";
import { ConvexStrategyDeploymentConfig, ConvexV1StrategyDeployment } from "./strategies/ConvexV1StrategyDeployment";
import { BigNumber } from "ethers";
import { MockStrategyDeploymentConfig, MockStrategyDeployment } from "./strategies/MockStrategyDeployment";
import { VaultUtilsDeployment } from "./VaultUtilsDeployment";
import { SingleAssetVaultV2 } from "../../types/SingleAssetVaultV2";
import * as strategies from "./strategies";

const DEFAULT_BOOST_VAULT_WEIGHT = 1;
const DEFAULT_BOOST_STAKING_WEIGHT = 9;

export interface VaultDeploymentConfig extends BaseConfig {
  name: string;
  symbol: string;
  governance: Wallet;
  gatekeeper: Wallet;
  manager: Wallet;
  // eslint-disable-next-line camelcase
  token_address: string;
  // eslint-disable-next-line camelcase
  management_fee: number;
  // eslint-disable-next-line camelcase
  max_debt_ratio: number;
  paused: boolean;
  // eslint-disable-next-line camelcase
  emergency_shutdown: boolean;
  // eslint-disable-next-line camelcase
  deposit_limit: number;
  strategies: Record<string, any>[];
  // eslint-disable-next-line camelcase
  withdraw_queue?: string[];
}

type VaultCurrentState = {
  // eslint-disable-next-line camelcase
  management_fee: number;
  paused: boolean;
  // eslint-disable-next-line camelcase
  emergency_shutdown: boolean;
  // eslint-disable-next-line camelcase
  deposit_limit: number;
  decimals: number;
  // eslint-disable-next-line camelcase
  staking_contract: string;
  // eslint-disable-next-line camelcase
  boost_vault_weight: number;
  // eslint-disable-next-line camelcase
  boost_staking_weight: number;
  // eslint-disable-next-line camelcase
  access_control_manager: string;
  // eslint-disable-next-line camelcase
  withdraw_queue: string[];
};

export class VaultDeployment extends ContractDeploymentUpdate {
  contractName = "SingleAssetVaultV2";
  upgradeable = true;
  config: VaultDeploymentConfig;
  vaultStrategyDataStoreDeployment: VaultStrategyDataStoreDeployment;

  constructor(commonArgs: DeployCommonArgs, config: VaultDeploymentConfig, vaultStrategyDataStoreDeployment: VaultStrategyDataStoreDeployment) {
    super(commonArgs, config.version);
    this.config = config;
    this.vaultStrategyDataStoreDeployment = vaultStrategyDataStoreDeployment;
  }

  get name(): string {
    return this.config.name;
  }

  async deployParams(): Promise<Array<any>> {
    return Promise.resolve([
      this.config.name,
      this.config.symbol,
      await this.getWalletAddress(this.config.governance),
      await this.getWalletAddress(this.config.gatekeeper),
      "$ADDRESS_FOR_FeeCollection",
      "$ADDRESS_FOR_VaultStrategyDataStore",
      this.config.token_address,
      "$ADDRESS_FOR_AccessControlManager",
      "$ADDRESS_FOR_YOPRewards",
      "$ADDRESS_FOR_Staking",
    ]);
  }

  async deploy(): Promise<Array<ContractDeploymentCall>> {
    let results = new Array<ContractDeploymentCall>();
    const deployRecords: Record<string, DeploymentRecord> = await readDeploymentFile(this.env);
    const commonArgs = { env: this.env, dryrun: this.dryrun };
    const record = deployRecords[this.name];
    let vaultAddress: string;
    if (!record || !record.address) {
      vaultAddress = `$ADDRESS_FOR_${this.name}`;
      const vaultUtilsDeployment = new VaultUtilsDeployment(commonArgs);
      results = results.concat(await vaultUtilsDeployment.deploy());
      results.push({
        name: this.name,
        contractName: this.contractName,
        upgradeable: this.upgradeable,
        params: await this.deployParams(),
        version: this.version,
        libraries: {
          VaultUtils: "$ADDRESS_FOR_VaultUtils",
        },
        initializer: "initializeV2",
      });
    } else {
      vaultAddress = record.address;
      if (this.version.toString() === "2") {
        results = results.concat(await this.upgradeToV2());
      }
      // TODO: when new version of vaults are deployed, we need to deploy the new version of VaultUtils
      // to fix the issue with token approval issue on for USDT vault
    }
    for (const s of this.config.strategies) {
      const strategyContract = s.contract as string;
      const strategyClass = strategies.getStrategyDeployment(strategyContract, s.version);
      const inst = new (<any>strategies)[strategyClass](
        commonArgs,
        vaultAddress,
        this.config.manager,
        this.vaultStrategyDataStoreDeployment,
        s as strategies.CommonStrategyConfig
      );
      results = results.concat(await inst.deploy());
    }
    return Promise.resolve(results);
  }

  async getCurrentState(address: string): Promise<any> {
    if (address) {
      const contract = (await ethers.getContractAt(VaultABI, address)) as SingleAssetVaultV2;
      const paused = await contract.paused();
      const managementFee = await contract.managementFee();
      const emergencyShutdown = await contract.emergencyShutdown();
      const depositLimit = await contract.depositLimit();
      const decimals = await contract.decimals();
      const stakingContract = await contract.stakingContract();
      const weights = await contract.boostFormulaWeights();
      const boostVaultWeight = weights.vaultBalanceWeight;
      const boostStakingWeight = weights.stakingBalanceWeight;
      const accessControlManager = await contract.accessManager();
      return {
        paused: paused,
        management_fee: managementFee.toNumber(),
        emergency_shutdown: emergencyShutdown,
        deposit_limit: depositLimit,
        decimals,
        staking_contract: stakingContract,
        boost_vault_weight: boostVaultWeight.toNumber(),
        boost_staking_weight: boostStakingWeight.toNumber(),
        access_control_manager: accessControlManager,
      };
    }
    return undefined;
  }

  async updateState(address: string, currentState: any): Promise<Array<ContractFunctionCall>> {
    let results = new Array<ContractFunctionCall>();
    let currentPaused;
    let currentManagementFee;
    let currentEmergencyShutdown;
    let currentDepositLimit;
    let vaultDecimals;
    let currentStakingContract;
    let currentBoostVaultWeight;
    let currentBoostStakingWeight;
    let currentAccessControlManager;
    if (currentState) {
      const s = currentState as VaultCurrentState;
      currentPaused = s.paused;
      currentManagementFee = s.management_fee;
      currentEmergencyShutdown = s.emergency_shutdown;
      vaultDecimals = s.decimals;
      currentDepositLimit = parseFloat(ethers.utils.formatUnits(s.deposit_limit, vaultDecimals));
      currentStakingContract = s.staking_contract;
      currentBoostVaultWeight = s.boost_vault_weight;
      currentBoostStakingWeight = s.boost_staking_weight;
      currentAccessControlManager = s.access_control_manager;
    }
    if (currentManagementFee !== this.config.management_fee) {
      results.push({
        address: address,
        abi: VaultABI,
        methodName: "setManagementFee",
        params: [this.config.management_fee],
        signer: this.config.governance,
      });
    }
    if (currentEmergencyShutdown !== this.config.emergency_shutdown) {
      results.push({
        address: address,
        abi: VaultABI,
        methodName: "setVaultEmergencyShutdown",
        params: [this.config.emergency_shutdown],
        signer: this.config.governance,
      });
      if (this.config.emergency_shutdown) {
        // for ermergency_shutdown to actually work, we also need to call `harvest` on all the active strategies to withdraw funds
        for (const s of this.config.strategies) {
          if (s.allocation > 0) {
            const strategyAddress = await this.getAddressByName(s.name);
            results.push({
              address: strategyAddress!,
              abi: BaseStrategyABI,
              methodName: "harvest",
              params: [],
              signer: this.config.governance,
            });
          }
        }
      }
    }
    if (currentDepositLimit !== this.config.deposit_limit) {
      let limit;
      if (this.config.deposit_limit !== undefined) {
        limit = ethers.utils.parseUnits(this.config.deposit_limit.toString(), vaultDecimals);
      } else {
        limit = ethers.constants.MaxUint256;
      }
      results.push({
        address: address,
        abi: VaultABI,
        methodName: "setDepositLimit",
        params: [limit],
        signer: this.config.governance,
      });
    }
    const stakingContract = await this.getAddressByName("Staking");
    if (currentStakingContract !== stakingContract) {
      results.push({
        address: address,
        abi: VaultABI,
        methodName: "setStakingContract",
        params: [stakingContract],
        signer: this.config.governance,
      });
    }
    if (currentBoostVaultWeight !== DEFAULT_BOOST_VAULT_WEIGHT || currentBoostStakingWeight !== DEFAULT_BOOST_STAKING_WEIGHT) {
      results.push({
        address: address,
        abi: VaultABI,
        methodName: "setBoostedFormulaWeights",
        params: [DEFAULT_BOOST_VAULT_WEIGHT, DEFAULT_BOOST_STAKING_WEIGHT],
        signer: this.config.governance,
      });
    }
    const commonArgs = { env: this.env, dryrun: this.dryrun };
    for (const s of this.config.strategies) {
      const strategyContract = s.contract as string;
      const strategyClass = strategies.getStrategyDeployment(strategyContract, s.version);
      const inst = new (<any>strategies)[strategyClass](
        commonArgs,
        address,
        this.config.manager,
        this.vaultStrategyDataStoreDeployment,
        s as strategies.CommonStrategyConfig
      );
      results = results.concat(await inst.update());
    }
    const managerAddress = await this.getWalletAddress(this.config.manager);
    const withdrawQueue: string[] = [];
    if (this.config.withdraw_queue && this.config.withdraw_queue.length > 0) {
      for (let i = 0; i < this.config.withdraw_queue.length; i++) {
        const strategyAddress = await this.getAddressByName(this.config.withdraw_queue[i]);
        if (strategyAddress) {
          withdrawQueue.push(strategyAddress);
        }
      }
    }
    results = results.concat(
      await this.vaultStrategyDataStoreDeployment.updateForVault(address, managerAddress, this.config.max_debt_ratio, withdrawQueue)
    );
    if (currentPaused !== this.config.paused) {
      results.push({
        address: address,
        abi: VaultABI,
        methodName: this.config.paused ? "pause" : "unpause",
        params: [],
        signer: this.config.governance,
      });
    }
    const latestAccessManager = await this.getAddressByName("AccessControlManager");
    if (currentAccessControlManager !== latestAccessManager) {
      results.push({
        address: address,
        abi: VaultABI,
        methodName: "setAccessManager",
        params: [latestAccessManager],
        signer: this.config.governance,
      });
    }
    return Promise.resolve(results);
  }

  async upgradeToV2(): Promise<Array<ContractDeploymentCall>> {
    const commonArgs = { env: this.env, version: this.version, dryrun: this.dryrun };
    let results = new Array<ContractDeploymentCall>();
    const vaultUtilsDeployment = new VaultUtilsDeployment(commonArgs);
    results = results.concat(await vaultUtilsDeployment.deploy());
    results.push({
      name: this.name,
      contractName: "SingleAssetVaultV2",
      upgradeable: true,
      version: this.version,
      isUpgrade: true,
      libraries: {
        VaultUtils: "$ADDRESS_FOR_VaultUtils",
      },
      signer: await this.upgradeSigner(),
    });
    return results;
  }

  async upgradeSigner(): Promise<Wallet | undefined> {
    return this.config.governance;
  }
}
