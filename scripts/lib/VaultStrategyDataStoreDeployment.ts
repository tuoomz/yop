import { BaseConfig, ContractDeploymentUpdate, ContractFunctionCall, DeployCommonArgs, Wallet } from "./ContractDeployment";
import VaultStrategyDataStoreABI from "../../abi/contracts/vaults/VaultStrategyDataStore.sol/VaultStrategyDataStore.json";
import { ethers } from "hardhat";
import { VaultStrategyDataStore } from "../../types";
import { BigNumber, BigNumberish } from "ethers";

export interface VaultStrategyDataStoreConfig extends BaseConfig {
  governance: Wallet;
}

export class VaultStrategyDataStoreDeployment extends ContractDeploymentUpdate {
  name = "VaultStrategyDataStore";
  contractName = "VaultStrategyDataStore";
  upgradeable = false;
  config: VaultStrategyDataStoreConfig;

  constructor(commonArgs: DeployCommonArgs, config: VaultStrategyDataStoreConfig) {
    super(commonArgs, config.version);
    this.config = config;
  }

  async deployParams(): Promise<Array<any>> {
    return Promise.resolve([await this.getWalletAddress(this.config.governance)]);
  }

  async getCurrentState(address: string): Promise<any> {
    // TODO: should fetch the current state from the contract
    return Promise.resolve({});
  }

  async updateState(address: string, currentState: any): Promise<Array<ContractFunctionCall>> {
    const results = new Array<ContractFunctionCall>();
    return Promise.resolve(results);
  }

  async updateForVault(
    vaultAddress: string,
    manager: string,
    maxDebtRatio: number,
    withdrawQueue?: string[]
  ): Promise<Array<ContractFunctionCall>> {
    let address = await this.currentAddress();
    const result = new Array<ContractFunctionCall>();
    let currentManager;
    let currentMaxDebtRatio;
    let currentWithdrawQueue;
    if (address) {
      const contract = (await ethers.getContractAt(VaultStrategyDataStoreABI, address)) as VaultStrategyDataStore;
      currentManager = await contract.vaultManager(vaultAddress);
      currentMaxDebtRatio = await contract.vaultMaxTotalDebtRatio(vaultAddress);
      currentWithdrawQueue = await contract.withdrawQueue(vaultAddress);
    } else {
      address = `$ADDRESS_FOR_${this.name}`;
    }
    if (currentManager !== manager) {
      result.push({
        address: address,
        abi: VaultStrategyDataStoreABI,
        methodName: "setVaultManager",
        params: [vaultAddress, manager],
        signer: this.config.governance,
      });
    }
    if (!currentMaxDebtRatio || currentMaxDebtRatio.toNumber() !== maxDebtRatio) {
      result.push({
        address: address,
        abi: VaultStrategyDataStoreABI,
        methodName: "setMaxTotalDebtRatio",
        params: [vaultAddress, maxDebtRatio],
        signer: this.config.governance,
      });
    }
    if (withdrawQueue && withdrawQueue.length > 0 && !arrayEquals(withdrawQueue, currentWithdrawQueue)) {
      result.push({
        address: address,
        abi: VaultStrategyDataStoreABI,
        methodName: "setWithdrawQueue",
        params: [vaultAddress, withdrawQueue],
        signer: this.config.governance,
      });
    }
    return Promise.resolve(result);
  }

  async updateForVaultStrategy(
    vaultAddress: string,
    vaultManager: Wallet,
    strategyAddress: string,
    performanceFee: number,
    debtRatio: number,
    migrateFromAddress: string | undefined,
    minDebtPerHarvest: BigNumberish = ethers.constants.Zero,
    maxDebtPerHarvest: BigNumberish = ethers.constants.MaxUint256
  ): Promise<Array<ContractFunctionCall>> {
    let results = new Array<ContractFunctionCall>();
    let address = await this.currentAddress();
    let strategies: string[] = [];
    let currentPerformanceFee;
    let currentDebtRatio;
    let currentMinDebtPerHarvest;
    let currentMaxDebtPerHarvest;
    if (address) {
      const contract = (await ethers.getContractAt(VaultStrategyDataStoreABI, address)) as VaultStrategyDataStore;
      strategies = await contract.vaultStrategies(vaultAddress);
      currentPerformanceFee = await contract.strategyPerformanceFee(vaultAddress, strategyAddress);
      currentDebtRatio = await contract.strategyDebtRatio(vaultAddress, strategyAddress);
      currentMinDebtPerHarvest = await contract.strategyMinDebtPerHarvest(vaultAddress, strategyAddress);
      currentMaxDebtPerHarvest = await contract.strategyMaxDebtPerHarvest(vaultAddress, strategyAddress);
    } else {
      address = `$ADDRESS_FOR_${this.name}`;
    }
    if (strategies.indexOf(strategyAddress) === -1) {
      if (typeof migrateFromAddress !== "undefined") {
        results = results.concat(await this.migrateStrategy(vaultAddress, migrateFromAddress, strategyAddress));
      } else {
        results.push({
          address: address,
          abi: VaultStrategyDataStoreABI,
          methodName: "addStrategy",
          params: [vaultAddress, strategyAddress, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee],
          signer: this.config.governance,
        });
      }
      return results;
    }
    if (!currentPerformanceFee || currentPerformanceFee.toNumber() !== performanceFee) {
      results.push({
        address: address,
        abi: VaultStrategyDataStoreABI,
        methodName: "updateStrategyPerformanceFee",
        params: [vaultAddress, strategyAddress, performanceFee],
        signer: this.config.governance,
      });
    }
    if (!currentDebtRatio || currentDebtRatio.toNumber() !== debtRatio) {
      results.push({
        address: address,
        abi: VaultStrategyDataStoreABI,
        methodName: "updateStrategyDebtRatio",
        params: [vaultAddress, strategyAddress, debtRatio],
        signer: this.config.governance,
      });
    }
    if (!currentMinDebtPerHarvest || !currentMinDebtPerHarvest.eq(minDebtPerHarvest)) {
      results.push({
        address: address,
        abi: VaultStrategyDataStoreABI,
        methodName: "updateStrategyMinDebtHarvest",
        params: [vaultAddress, strategyAddress, minDebtPerHarvest],
        signer: this.config.governance,
      });
    }
    if (!currentMaxDebtPerHarvest || !currentMaxDebtPerHarvest.eq(maxDebtPerHarvest)) {
      results.push({
        address: address,
        abi: VaultStrategyDataStoreABI,
        methodName: "updateStrategyMaxDebtHarvest",
        params: [vaultAddress, strategyAddress, maxDebtPerHarvest],
        signer: this.config.governance,
      });
    }
    return results;
  }

  async migrateStrategy(vault: string, fromStrategy: string, toStrategy: string): Promise<Array<ContractFunctionCall>> {
    const results = new Array<ContractFunctionCall>();
    const address = await this.currentAddress();
    const contract = (await ethers.getContractAt(VaultStrategyDataStoreABI, address!)) as VaultStrategyDataStore;
    const strategies = await contract.vaultStrategies(vault);
    if (strategies.indexOf(fromStrategy) > -1) {
      // the old strategy is not migrated yet
      results.push({
        address: address!,
        abi: VaultStrategyDataStoreABI,
        methodName: "migrateStrategy",
        params: [vault, fromStrategy, toStrategy],
        signer: this.config.governance,
      });
    }
    return results;
  }
}

function arrayEquals(a: string[], b: string[]): boolean {
  a = [...a].sort();
  b = [...b].sort();
  return a.length === b.length && a.every((val, i) => val === b[i]);
}
