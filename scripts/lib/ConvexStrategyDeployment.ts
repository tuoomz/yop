import { ContractDeploymentUpdate, ContractFunctionCall, Wallet } from "./ContractDeployment";
import { VaultStrategyDataStoreDeployment } from "./VaultStrategyDataStoreDeployment";
import { ethers } from "hardhat";
export type ConvexStrategyDeploymentConfig = {
  name: string;
  contract: string;
  harvester: string;
  pool: string;
  booster: string;
  // eslint-disable-next-line camelcase
  performance_fee: number;
  allocation: number;
};

export class ConvexStrategyDeployment extends ContractDeploymentUpdate {
  upgradeable = false;
  vaultStrategyDataStoreDeployment: VaultStrategyDataStoreDeployment;
  config: ConvexStrategyDeploymentConfig;
  vault: string;
  vaultManager: Wallet;

  constructor(
    env: string,
    vault: string,
    vaultManager: Wallet,
    vaultStrategyDataStoreDeployment: VaultStrategyDataStoreDeployment,
    config: ConvexStrategyDeploymentConfig
  ) {
    super(env);
    this.vaultStrategyDataStoreDeployment = vaultStrategyDataStoreDeployment;
    this.config = config;
    this.vault = vault;
    this.vaultManager = vaultManager;
  }

  get contractName(): string {
    return this.config.contract;
  }

  get name(): string {
    return this.config.name;
  }

  async deployParams(): Promise<Array<any>> {
    return Promise.resolve([
      this.vault,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      this.config.harvester,
      this.config.pool,
      this.config.booster,
    ]);
  }

  async getCurrentState(address: string): Promise<any> {
    // TODO: should fetch the current state from the contract
    return Promise.resolve({});
  }

  async updateState(address: string, currentState: any): Promise<Array<ContractFunctionCall>> {
    return await this.vaultStrategyDataStoreDeployment.updateForVaultStrategy(
      this.vault,
      this.vaultManager,
      address,
      this.config.performance_fee,
      this.config.allocation
    );
  }
}
