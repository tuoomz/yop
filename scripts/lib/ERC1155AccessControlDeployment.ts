import { ContractDeploymentUpdate, ContractFunctionCall, Wallet } from "./ContractDeployment";
import ERC1155AccessControlABI from "../../abi/contracts/access/ERC1155AccessControl.sol/ERC1155AccessControl.json";

type NFTConfig = {
  // eslint-disable-next-line camelcase
  contract_address: string;
  // eslint-disable-next-line camelcase
  token_ids: Array<string>;
};

// TODO: add support for per-vault config
export type ERC1155AccessConfig = {
  enabled: boolean;
  governance: Wallet;
  global: Array<NFTConfig>;
};

export class ERC1155AccessControlDeployment extends ContractDeploymentUpdate {
  name = "ERC1155AccessControl";
  contractName = "ERC1155AccessControl";
  upgradeable = false;
  config: ERC1155AccessConfig;
  constructor(env: string, args: ERC1155AccessConfig) {
    super(env);
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
      const contracts = new Array<string>();
      const ids = new Array<Array<string>>();
      for (let i = 0; i < this.config.global.length; i++) {
        contracts.push(this.config.global[i].contract_address);
        ids.push(this.config.global[i].token_ids);
      }
      results.push({
        abi: ERC1155AccessControlABI,
        address: address,
        methodName: "addGlobalNftAccess",
        params: [contracts, ids],
        signer: this.config.governance,
      });
    }
    return Promise.resolve(results);
  }

  enabled(): boolean {
    return this.config.enabled;
  }
}
