import { ContractDeploymentUpdate, ContractFunctionCall, Wallet, DeployCommonArgs, BaseConfig } from "./ContractDeployment";
import AllowlistAccessControlABI from "../../abi/contracts/access/AllowListAccessControl.sol/AllowlistAccessControl.json";

// TODO: add support for per-vault config
export interface AllowlistAccessConfig extends BaseConfig {
  enabled: boolean;
  governance: Wallet;
  global: Array<string>;
}

export class AllowlistAccessControlDeployment extends ContractDeploymentUpdate {
  name = "AllowlistAccessControl";
  contractName = "AllowlistAccessControl";
  upgradeable = false;
  config: AllowlistAccessConfig;
  constructor(commonArgs: DeployCommonArgs, args: AllowlistAccessConfig) {
    super(commonArgs, args.version);
    this.config = args;
  }

  async deployParams(): Promise<Array<any>> {
    return Promise.resolve([await this.getWalletAddress(this.config.governance)]);
  }

  async getCurrentState(address: string): Promise<any> {
    // TODO: should fetch the current state from the contract, need to update the contract to do this.
    // save it locally to a file doesn't really work ver well as we don't know if the change will be applied (especially for multisig transactions)
    return Promise.resolve({});
  }

  async updateState(address: string, currentState: any): Promise<Array<ContractFunctionCall>> {
    const results = new Array<ContractFunctionCall>();
    if (this.config.enabled && this.config.global.length > 0) {
      results.push({
        abi: AllowlistAccessControlABI,
        address: address,
        methodName: "allowGlobalAccess",
        params: [this.config.global],
        signer: this.config.governance,
      });
    }
    return Promise.resolve(results);
  }

  enabled(): boolean {
    return this.config.enabled;
  }
}
