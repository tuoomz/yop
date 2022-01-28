import { ContractDeploymentUpdate, ContractFunctionCall, Wallet } from "./ContractDeployment";
import VaultStrategyDataStoreABI from "../../abi/contracts/vaults/VaultStrategyDataStore.sol/VaultStrategyDataStore.json";
import { ethers } from "hardhat";
import { VaultStrategyDataStore } from "../../types";
import { BigNumber, BigNumberish } from "ethers";

export type VaultStrategyDataStoreConfig = {
  governance: Wallet;
};

export class VaultStrategyDataStoreDeployment extends ContractDeploymentUpdate {
  name = "VaultStrategyDataStore";
  contractName = "VaultStrategyDataStore";
  upgradeable = false;
  config: VaultStrategyDataStoreConfig;

  constructor(env: string, config: VaultStrategyDataStoreConfig) {
    super(env);
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

  async updateForVault(vaultAddress: string, manager: string, maxDebtRatio: number): Promise<Array<ContractFunctionCall>> {
    let address = await this.currentAddress();
    const result = new Array<ContractFunctionCall>();
    let currentManager;
    let currentMaxDebtRatio;
    if (address) {
      const contract = (await ethers.getContractAt(VaultStrategyDataStoreABI, address)) as VaultStrategyDataStore;
      currentManager = await contract.vaultManager(vaultAddress);
      currentMaxDebtRatio = await contract.vaultMaxTotalDebtRatio(vaultAddress);
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
    return Promise.resolve(result);
  }

  async updateForVaultStrategy(
    vaultAddress: string,
    vaultManager: Wallet,
    strategyAddress: string,
    performanceFee: number,
    debtRatio: number,
    minDebtPerHarvest: BigNumberish = ethers.constants.Zero,
    maxDebtPerHarvest: BigNumberish = ethers.constants.MaxUint256
  ): Promise<Array<ContractFunctionCall>> {
    const results = new Array<ContractFunctionCall>();
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
      results.push({
        address: address,
        abi: VaultStrategyDataStoreABI,
        methodName: "addStrategy",
        params: [vaultAddress, strategyAddress, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee],
        signer: this.config.governance,
      });
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
        signer: vaultManager,
      });
    }
    if (!currentMinDebtPerHarvest || !currentMinDebtPerHarvest.eq(minDebtPerHarvest)) {
      results.push({
        address: address,
        abi: VaultStrategyDataStoreABI,
        methodName: "updateStrategyMinDebtHarvest",
        params: [vaultAddress, strategyAddress, minDebtPerHarvest],
        signer: vaultManager,
      });
    }
    if (!currentMaxDebtPerHarvest || !currentMaxDebtPerHarvest.eq(maxDebtPerHarvest)) {
      results.push({
        address: address,
        abi: VaultStrategyDataStoreABI,
        methodName: "updateStrategyMaxDebtHarvest",
        params: [vaultAddress, strategyAddress, maxDebtPerHarvest],
        signer: vaultManager,
      });
    }
    return results;
  }
}