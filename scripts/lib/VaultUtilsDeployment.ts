import { ContractDeploymentUpdate, ContractFunctionCall, DeployCommonArgs } from "./ContractDeployment";
export class VaultUtilsDeployment extends ContractDeploymentUpdate {
  name = "VaultUtils";
  contractName = "VaultUtils";
  upgradeable = false;

  constructor(commonArgs: DeployCommonArgs) {
    super(commonArgs, "1");
  }

  async deployParams(): Promise<Array<any>> {
    return [];
  }

  getCurrentState(address: string): Promise<any> {
    return Promise.resolve({});
  }

  async updateState(address: string, currentState: any): Promise<Array<ContractFunctionCall>> {
    return [];
  }
}
