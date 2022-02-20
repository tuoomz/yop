import { ContractDeploymentUpdate, ContractDeploymentCall, ContractFunctionCall, Wallet, DeploymentRecord } from "./ContractDeployment";
import VaultABI from "../../abi/contracts/vaults/SingleAssetVault.sol/SingleAssetVault.json";
import { ethers } from "hardhat";
import { readDeploymentFile } from "../util";
import { CurveStrategyDeploymentConfig, CurveStrategyDeployment } from "./CurveStrategyDeployment";
import { VaultStrategyDataStoreDeployment } from "./VaultStrategyDataStoreDeployment";
import { ConvexStrategyDeploymentConfig, ConvexStrategyDeployment } from "./ConvexStrategyDeployment";
import { SingleAssetVault } from "../../types/SingleAssetVault";
import { BigNumber } from "ethers";
import { MockStrategyDeploymentConfig, MockStrategyDeployment } from "./MockStrategyDeployment";

export type VaultDeploymentConfig = {
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
};

type VaultCurrentState = {
  // eslint-disable-next-line camelcase
  management_fee: number;
  paused: boolean;
  // eslint-disable-next-line camelcase
  emergency_shutdown: boolean;
  // eslint-disable-next-line camelcase
  deposit_limit: number;
  decimals: number;
};

export class VaultDeployment extends ContractDeploymentUpdate {
  contractName = "SingleAssetVault";
  upgradeable = true;
  config: VaultDeploymentConfig;
  vaultStrategyDataStoreDeployment: VaultStrategyDataStoreDeployment;

  constructor(env: string, config: VaultDeploymentConfig, vaultStrategyDataStoreDeployment: VaultStrategyDataStoreDeployment) {
    super(env);
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
    ]);
  }

  async deploy(): Promise<Array<ContractDeploymentCall>> {
    let results = new Array<ContractDeploymentCall>();
    const deployRecords: Record<string, DeploymentRecord> = await readDeploymentFile(this.env);
    const record = deployRecords[this.name];
    let vaultAddress: string;
    if (!record || !record.address) {
      vaultAddress = `$ADDRESS_FOR_${this.name}`;
      results.push({
        name: this.name,
        contractName: this.contractName,
        upgradeable: this.upgradeable,
        params: await this.deployParams(),
      });
    } else {
      vaultAddress = record.address;
    }
    for (const s of this.config.strategies) {
      const strategyContract = s.contract as string;
      if (strategyContract.startsWith("Curve")) {
        const curveStrategyConfig = s as CurveStrategyDeploymentConfig;
        const curveStrategy = new CurveStrategyDeployment(
          this.env,
          vaultAddress,
          this.config.manager,
          this.vaultStrategyDataStoreDeployment,
          curveStrategyConfig
        );
        results = results.concat(await curveStrategy.deploy());
      } else if (strategyContract.startsWith("Convex")) {
        const convexStrategyConfig = s as ConvexStrategyDeploymentConfig;
        const convexStrategy = new ConvexStrategyDeployment(
          this.env,
          vaultAddress,
          this.config.manager,
          this.vaultStrategyDataStoreDeployment,
          convexStrategyConfig
        );
        results = results.concat(await convexStrategy.deploy());
      } else if (strategyContract.startsWith("Testnet")) {
        const mockStrategyConfig = s as MockStrategyDeploymentConfig;
        const mockStrategy = new MockStrategyDeployment(
          this.env,
          vaultAddress,
          this.config.manager,
          this.vaultStrategyDataStoreDeployment,
          mockStrategyConfig
        );
        results = results.concat(await mockStrategy.deploy());
      } else {
        throw new Error("unsupported strategy contract " + strategyContract);
      }
    }
    return Promise.resolve(results);
  }

  async getCurrentState(address: string): Promise<any> {
    if (address) {
      const contract = (await ethers.getContractAt(VaultABI, address)) as SingleAssetVault;
      const paused = await contract.paused();
      const managementFee = await contract.managementFee();
      const emergencyShutdown = await contract.emergencyShutdown();
      const depositLimit = await contract.depositLimit();
      const decimals = await contract.decimals();
      return {
        paused: paused,
        management_fee: managementFee.toNumber(),
        emergency_shutdown: emergencyShutdown,
        deposit_limit: depositLimit,
        decimals,
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
    if (currentState) {
      const s = currentState as VaultCurrentState;
      currentPaused = s.paused;
      currentManagementFee = s.management_fee;
      currentEmergencyShutdown = s.emergency_shutdown;
      vaultDecimals = s.decimals;
      currentDepositLimit = parseFloat(ethers.utils.formatUnits(s.deposit_limit, vaultDecimals));
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
    const managerAddress = await this.getWalletAddress(this.config.manager);
    results = results.concat(await this.vaultStrategyDataStoreDeployment.updateForVault(address, managerAddress, this.config.max_debt_ratio));
    for (const s of this.config.strategies) {
      const strategyAdd = await this.getAddressByNameOrRandom(s.name);
      let minDebtPerHarvest;
      let maxDebtPerHarvest;
      if (typeof s.minDebtPerHarvest !== "undefined") {
        minDebtPerHarvest = BigNumber.from(s.minDebtPerHarvest);
      }
      if (typeof s.maxDebtPerHarvest !== "undefined") {
        maxDebtPerHarvest = BigNumber.from(s.maxDebtPerHarvest);
      }
      results = results.concat(
        await this.vaultStrategyDataStoreDeployment.updateForVaultStrategy(
          address,
          this.config.manager,
          strategyAdd,
          s.performance_fee,
          s.allocation,
          minDebtPerHarvest,
          maxDebtPerHarvest
        )
      );
    }
    if (currentPaused !== this.config.paused) {
      results.push({
        address: address,
        abi: VaultABI,
        methodName: this.config.paused ? "pause" : "unpause",
        params: [],
        signer: this.config.governance,
      });
    }
    return Promise.resolve(results);
  }
}
