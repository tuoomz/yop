import { BaseConfig, ContractDeploymentUpdate, ContractFunctionCall, DeployCommonArgs, Wallet } from "./ContractDeployment";

export interface YopRouterDeploymentConfig extends BaseConfig {
  governance: Wallet;
  // eslint-disable-next-line camelcase
  uniswap_address: string;
  // eslint-disable-next-line camelcase
  yop_address: string;
  // eslint-disable-next-line camelcase
  weth_address: string;
}

type YopRouterCurrentState = Record<string, unknown>;

export class YOPRouterDeployment extends ContractDeploymentUpdate {
  name = "YOPRouter";
  contractName = "YOPRouter";
  upgradeable = true;
  config: YopRouterDeploymentConfig;

  constructor(commonArgs: DeployCommonArgs, config: YopRouterDeploymentConfig) {
    super(commonArgs, config.version);
    this.config = config;
  }

  async deployParams(): Promise<Array<any>> {
    return Promise.resolve([
      await this.getWalletAddress(this.config.governance),
      "$ADDRESS_FOR_Staking",
      this.config.uniswap_address,
      "$ADDRESS_FOR_YOPRegistry",
      this.config.yop_address,
      this.config.weth_address,
    ]);
  }

  async getCurrentState(address: string): Promise<any> {
    return Promise.resolve();
  }

  async updateState(address: string, currentState: any): Promise<Array<ContractFunctionCall>> {
    return Promise.resolve([]);
  }

  async upgradeSigner(): Promise<Wallet | undefined> {
    return this.config.governance;
  }
}
