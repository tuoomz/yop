import { BaseConfig, ContractDeploymentUpdate, ContractFunctionCall, DeployCommonArgs, Wallet } from "./ContractDeployment";
import { ethers } from "hardhat";
import { YOPRegistry } from "../../types/YOPRegistry";
import YOPRegistryABI from "../../abi/contracts/registry/YOPRegistry.sol/YOPRegistry.json";

export interface YopRegistryDeploymentConfig extends BaseConfig {
  governance: Wallet;
  vaultNames: Array<string>;
}

type YopRegistryCurrentState = {
  vaults: Array<string>;
};

export class YopRegistryDeployment extends ContractDeploymentUpdate {
  name = "YOPRegistry";
  contractName = "YOPRegistry";
  upgradeable = true;
  config: YopRegistryDeploymentConfig;

  constructor(commonArgs: DeployCommonArgs, config: YopRegistryDeploymentConfig) {
    super(commonArgs, config.version);
    this.config = config;
  }

  async deployParams(): Promise<Array<any>> {
    return Promise.resolve([await this.getWalletAddress(this.config.governance)]);
  }

  async getCurrentState(address: string): Promise<any> {
    if (address) {
      const contract = (await ethers.getContractAt(YOPRegistryABI, address)) as YOPRegistry;
      const numberOfVaults = await contract.totalVaults();
      const allVaults: Array<string> = [];
      for (let i = 0; i < numberOfVaults.toNumber(); i++) {
        const vault = await contract.allVaults(i);
        allVaults.push(vault);
      }
      return {
        vaults: allVaults,
      };
    }
    return undefined;
  }

  async updateState(address: string, currentState: any): Promise<Array<ContractFunctionCall>> {
    const results = new Array<ContractFunctionCall>();
    let currentVaults: Array<string> = [];
    if (currentState) {
      const s = currentState as YopRegistryCurrentState;
      currentVaults = s.vaults;
    }
    for (let i = 0; i < this.config.vaultNames.length; i++) {
      const vaultAddress = await this.getAddressByName(this.config.vaultNames[i]);
      if (vaultAddress && currentVaults.indexOf(vaultAddress) < 0) {
        results.push({
          address: address,
          abi: YOPRegistryABI,
          methodName: "registerVault",
          params: [vaultAddress],
          signer: this.config.governance,
        });
      }
    }
    return Promise.resolve(results);
  }

  async upgradeSigner(): Promise<Wallet | undefined> {
    return this.config.governance;
  }
}
