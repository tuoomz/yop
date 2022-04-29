import { ContractDeploymentUpdate, ContractFunctionCall, Wallet, DeployCommonArgs } from "../ContractDeployment";
import { VaultStrategyDataStoreDeployment } from "../VaultStrategyDataStoreDeployment";
import { ethers } from "hardhat";
export type MockStrategyDeploymentConfig = {
  name: string;
  contract: string;
  harvester: string;
  // eslint-disable-next-line camelcase
  performance_fee: number;
  allocation: number;
  version: string;
};

export class MockStrategyDeployment extends ContractDeploymentUpdate {
  upgradeable = false;
  vaultStrategyDataStoreDeployment: VaultStrategyDataStoreDeployment;
  config: MockStrategyDeploymentConfig;
  vault: string;
  vaultManager: Wallet;

  constructor(
    commonArgs: DeployCommonArgs,
    vault: string,
    vaultManager: Wallet,
    vaultStrategyDataStoreDeployment: VaultStrategyDataStoreDeployment,
    config: MockStrategyDeploymentConfig
  ) {
    super(commonArgs, config.version);
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
    return Promise.resolve([this.vault, ethers.constants.AddressZero, ethers.constants.AddressZero, this.config.harvester]);
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
      this.config.allocation,
      undefined
    );
  }
}
