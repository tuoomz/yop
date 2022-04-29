import { ethers } from "hardhat";
import { CommonStrategyConfig } from "./types";
import { BaseStrategyDeployment } from "./BaseStrategyDeployment";
export interface CurveStrategyDeploymentConfig extends CommonStrategyConfig {
  pool: string;
}

export class CurveV1StrategyDeployment extends BaseStrategyDeployment {
  async deployParams(): Promise<Array<any>> {
    const config = this.config as CurveStrategyDeploymentConfig;
    return Promise.resolve([this.vault, ethers.constants.AddressZero, ethers.constants.AddressZero, this.config.harvester, config.pool]);
  }
}
