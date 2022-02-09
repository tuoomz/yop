import { ContractDeploymentUpdate, ContractFunctionCall, Wallet } from "./ContractDeployment";
import AllowAnyAccessControlABI from "../../abi/contracts/access/AllowAnyAccessControl.sol/AllowAnyAccessControl.json";

// TODO: add support for per-vault config
export type AllowAnyAccessConfig = {
  enabled: boolean;
  governance: Wallet;
  global: boolean;
};

export class AllowAnyAccessControlDeployment extends ContractDeploymentUpdate {
  name = "AllowAnyAccessControl";
  contractName = "AllowAnyAccessControl";
  upgradeable = false;
  config: AllowAnyAccessConfig;
  constructor(env: string, dryrun: boolean, args: AllowAnyAccessConfig) {
    super(env, dryrun);
    this.config = args;
  }

  async deployParams(): Promise<Array<any>> {
    return Promise.resolve([await this.getWalletAddress(this.config.governance)]);
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

  async updateState(address: string, currentState: AllowAnyAccessConfig): Promise<Array<ContractFunctionCall>> {
    const results = new Array<ContractFunctionCall>();
    if (this.config.enabled && this.config.global !== currentState.global) {
      results.push({
        abi: AllowAnyAccessControlABI,
        address: address,
        methodName: "setDefault",
        params: [this.config.global],
        signer: this.config.governance,
      });
    }
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
