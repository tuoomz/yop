import { ContractDeploymentUpdate, ContractFunctionCall, Wallet, DeployCommonArgs, BaseConfig } from "./ContractDeployment";
import ERC1155AccessControlABI from "../../abi/contracts/access/ERC1155AccessControl.sol/ERC1155AccessControl.json";

type NFTConfig = {
  // eslint-disable-next-line camelcase
  contract_address: string;
  // eslint-disable-next-line camelcase
  token_ids: Array<string>;
};

// TODO: add support for per-vault config
export interface ERC1155AccessConfig extends BaseConfig {
  enabled: boolean;
  governance: Wallet;
  global: Array<NFTConfig>;
}

export class ERC1155AccessControlDeployment extends ContractDeploymentUpdate {
  name = "ERC1155AccessControl";
  contractName = "ERC1155AccessControl";
  upgradeable = false;
  config: ERC1155AccessConfig;
  constructor(commonArgs: DeployCommonArgs, args: ERC1155AccessConfig) {
    super(commonArgs, args.version);
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

  async updateState(address: string, currentState: ERC1155AccessConfig): Promise<Array<ContractFunctionCall>> {
    const results = new Array<ContractFunctionCall>();
    if (this.config.enabled && this.config.global.length > 0) {
      const contractsToAdd = new Array<string>();
      const idsToAdd = new Array<Array<string>>();
      const contractsToRemove = new Array<string>();
      const idsToRemove = new Array<Array<string>>();
      let existingGlobal;
      if (currentState != null) {
        existingGlobal = currentState.global;
      }
      for (let i = 0; i < this.config.global.length; i++) {
        const contractAddress = this.config.global[i].contract_address;
        if (!existingGlobal || (existingGlobal && !hasAddress(existingGlobal, contractAddress))) {
          contractsToAdd.push(contractAddress);
          idsToAdd.push(this.config.global[i].token_ids);
        }
        if (existingGlobal && hasAddress(existingGlobal, contractAddress)) {
          const wantIds = this.config.global[i].token_ids;
          const existingIds = getTokenIds(existingGlobal, contractAddress);
          const toAdd = itemsToAdd(existingIds, wantIds);
          if (toAdd.length > 0) {
            contractsToAdd.push(contractAddress);
            idsToAdd.push(toAdd);
          }
        }
      }
      if (existingGlobal != null) {
        for (let i = 0; i < existingGlobal.length; i++) {
          const contractAddress = existingGlobal[i].contract_address;
          if (!hasAddress(this.config.global, contractAddress)) {
            contractsToRemove.push(contractAddress);
            idsToRemove.push(existingGlobal[i].token_ids);
          } else {
            const wantIds = this.config.global[i].token_ids;
            const existingIds = getTokenIds(existingGlobal, contractAddress);
            const toRemove = itemsToRemove(existingIds, wantIds);
            if (toRemove.length > 0) {
              contractsToRemove.push(contractAddress);
              idsToRemove.push(toRemove);
            }
          }
        }
      }
      if (contractsToAdd.length > 0) {
        results.push({
          abi: ERC1155AccessControlABI,
          address: address,
          methodName: "addGlobalNftAccess",
          params: [contractsToAdd, idsToAdd],
          signer: this.config.governance,
        });
      }
      if (contractsToRemove.length > 0) {
        results.push({
          abi: ERC1155AccessControlABI,
          address: address,
          methodName: "removeGlobalNftAccess",
          params: [contractsToRemove, idsToRemove],
          signer: this.config.governance,
        });
      }
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

function hasAddress(configs: NFTConfig[], address: string): boolean {
  for (const c of configs) {
    if (c.contract_address === address) {
      return true;
    }
  }
  return false;
}

function getTokenIds(configs: NFTConfig[], address: string): string[] {
  for (const c of configs) {
    if (c.contract_address === address) {
      return c.token_ids;
    }
  }
  return [];
}

function itemsToAdd(oldArr: string[], newArr: string[]): string[] {
  const results: string[] = [];
  for (const i of newArr) {
    if (oldArr.indexOf(i) === -1) {
      results.push(i);
    }
  }
  return results;
}

function itemsToRemove(oldArr: string[], newArr: string[]): string[] {
  const results: string[] = [];
  for (const i of oldArr) {
    if (newArr.indexOf(i) === -1) {
      results.push(i);
    }
  }
  return results;
}
