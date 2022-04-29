import { ContractDeploymentUpdate, ContractFunctionCall, DeployCommonArgs, Wallet, BaseConfig } from "../ContractDeployment";
import { VaultStrategyDataStoreDeployment } from "../VaultStrategyDataStoreDeployment";
import { ethers } from "hardhat";
import { BaseStrategyDeployment } from "./BaseStrategyDeployment";
import { CommonStrategyConfig } from "./types";
export interface ConvexStrategyDeploymentConfig extends CommonStrategyConfig {
  pool: string;
  booster: string;
}

export class ConvexV1StrategyDeployment extends BaseStrategyDeployment {
  async deployParams(): Promise<Array<any>> {
    const config = this.config as ConvexStrategyDeploymentConfig;
    return Promise.resolve([
      this.vault,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      this.config.harvester,
      config.pool,
      config.booster,
    ]);
  }
}
