import { ContractDeploymentUpdate, ContractFunctionCall, Wallet, DeployCommonArgs, BaseConfig } from "./ContractDeployment";

// TODO: add support for per-vault config
export interface SanctionlistAccessConfig extends BaseConfig {
  enabled: boolean;
  governance: Wallet;
  // eslint-disable-next-line camelcase
  list_address: string;
}

export class SanctionlistAccessControlDeployment extends ContractDeploymentUpdate {
  name = "SanctionlistAccessControl";
  contractName = "SanctionsListAccessControl";
  upgradeable = false;
  config: SanctionlistAccessConfig;
  constructor(commonArgs: DeployCommonArgs, args: SanctionlistAccessConfig) {
    super(commonArgs, args.version);
    this.config = args;
  }

  async deployParams(): Promise<Array<any>> {
    return Promise.resolve([await this.getWalletAddress(this.config.governance), this.config.list_address]);
  }

  async getCurrentState(address: string): Promise<any> {
    // TODO: should fetch the current state from the contract, need to update the contract to do this.
    // save it locally to a file doesn't really work ver well as we don't know if the change will be applied (especially for multisig transactions)
    const deploymentConfig = await this.deploymentRecords();
    if (deploymentConfig[this.name] && deploymentConfig[this.name].configuration) {
      return deploymentConfig[this.name].configuration;
    }
    return Promise.resolve({});
  }

  async updateState(address: string, currentState: SanctionlistAccessConfig): Promise<Array<ContractFunctionCall>> {
    const results = new Array<ContractFunctionCall>();
    if (!this.dryrun) {
      const deploymentConfig = await this.deploymentRecords();
      deploymentConfig[this.name].configuration = this.config;
      await this.writeDeploymentRecords(deploymentConfig);
    }
    return Promise.resolve(results);
  }

  enabled(): boolean {
    return this.config.enabled;
  }
}
