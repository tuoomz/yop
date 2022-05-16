import { BigNumber } from "ethers";
import { ContractDeploymentUpdate, ContractFunctionCall, DeployCommonArgs, Wallet } from "../ContractDeployment";
import { VaultStrategyDataStoreDeployment } from "../VaultStrategyDataStoreDeployment";
import { CommonStrategyConfig } from "./types";
import BaseStrategyABI from "../../../abi/contracts/strategies/BaseStrategy.sol/BaseStrategy.json";
import { ethers } from "hardhat";
import { BaseStrategy } from "../../../types";

export abstract class BaseStrategyDeployment extends ContractDeploymentUpdate {
  upgradeable = false;
  vaultStrategyDataStoreDeployment: VaultStrategyDataStoreDeployment;
  vault: string;
  vaultManager: Wallet;
  config: CommonStrategyConfig;

  constructor(
    commonArgs: DeployCommonArgs,
    vault: string,
    vaultManager: Wallet,
    vaultStrategyDataStoreDeployment: VaultStrategyDataStoreDeployment,
    config: CommonStrategyConfig
  ) {
    super(commonArgs, config.version);
    this.vaultStrategyDataStoreDeployment = vaultStrategyDataStoreDeployment;
    this.vault = vault;
    this.vaultManager = vaultManager;
    this.config = config;
  }

  get contractName(): string {
    return this.config.contract;
  }

  get name(): string {
    return this.config.name;
  }

  async getCurrentState(address: string): Promise<any> {
    // TODO: should fetch the current state from the contract
    return Promise.resolve({});
  }

  async updateState(address: string, currentState: any): Promise<Array<ContractFunctionCall>> {
    let results = new Array<ContractFunctionCall>();
    let fromStrategyAddress;
    if (this.config.migrate_from) {
      fromStrategyAddress = await this.getAddressByName(this.config.migrate_from);
      if (!fromStrategyAddress) {
        throw new Error("no address found for strategy " + this.config.migrate_from);
      }
    }
    let minDebtPerHarvest;
    let maxDebtPerHarvest;
    if (typeof this.config.min_debt_per_harvest !== "undefined") {
      minDebtPerHarvest = BigNumber.from(this.config.min_debt_per_harvest);
    }
    if (typeof this.config.max_debt_per_harvest !== "undefined") {
      maxDebtPerHarvest = BigNumber.from(this.config.max_debt_per_harvest);
    }
    results = results.concat(
      await this.vaultStrategyDataStoreDeployment.updateForVaultStrategy(
        this.vault,
        this.vaultManager,
        address,
        this.config.performance_fee,
        this.config.allocation,
        fromStrategyAddress,
        minDebtPerHarvest,
        maxDebtPerHarvest
      )
    );
    const strategyContract = (await ethers.getContractAt(BaseStrategyABI, address)) as BaseStrategy;
    const emergencyExit = await strategyContract.emergencyExit();
    if (this.config.emergency_exit && !emergencyExit) {
      results.push({
        address: address,
        abi: BaseStrategyABI,
        methodName: "setEmergencyExit",
        params: [],
        signer: this.vaultStrategyDataStoreDeployment.config.governance,
      });
      results.push({
        address: address,
        abi: BaseStrategyABI,
        methodName: "harvest",
        params: [],
        signer: this.vaultStrategyDataStoreDeployment.config.governance,
      });
    }
    return results;
  }
}
