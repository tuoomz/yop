import { ContractDeploymentCall, ContractDeploymentUpdate, ContractFunctionCall, Wallet } from "./ContractDeployment";
import { AllowlistAccessControlDeployment, AllowlistAccessConfig } from "./AllowlistAccessControlDeployment";
import { ERC1155AccessControlDeployment, ERC1155AccessConfig } from "./ERC1155AccessControlDeployment";
import { AllowAnyAccessConfig, AllowAnyAccessControlDeployment } from "./AllowAnyAccessControlDeployment";
import AccessManagerABI from "../../abi/contracts/access/AccessControlManager.sol/AccessControlManager.json";

import { ethers } from "hardhat";
import { AccessControlManager } from "../../types/AccessControlManager";

type AccessManagerConfig = {
  governance: Wallet;
  allowlist: AllowlistAccessConfig;
  erc1155: ERC1155AccessConfig;
  allowany: AllowAnyAccessConfig;
};

export class AccessControlManagerDeployment extends ContractDeploymentUpdate {
  name = "AccessControlManager";
  contractName = "AccessControlManager";
  upgradeable = false;
  governance: Wallet;
  allowlistAccessDeployment: AllowlistAccessControlDeployment;
  erc1155AccessDeployment: ERC1155AccessControlDeployment;
  allowanyAccessDeployment: AllowAnyAccessControlDeployment;
  constructor(env: string, dryrun: boolean, args: AccessManagerConfig) {
    super(env, dryrun);
    this.governance = args.governance;
    this.allowlistAccessDeployment = new AllowlistAccessControlDeployment(env, args.allowlist);
    this.erc1155AccessDeployment = new ERC1155AccessControlDeployment(env, dryrun, args.erc1155);
    this.allowanyAccessDeployment = new AllowAnyAccessControlDeployment(env, dryrun, args.allowany);
  }

  deployParams(): Promise<Array<any>> {
    return Promise.resolve(new Array<any>());
  }

  async deploy(): Promise<Array<ContractDeploymentCall>> {
    let results = new Array<ContractDeploymentCall>();
    const policies = new Array<string>();
    if (this.allowlistAccessDeployment.enabled()) {
      let allowlistAddress = await this.allowlistAccessDeployment.currentAddress();
      if (!allowlistAddress) {
        results = results.concat(await this.allowlistAccessDeployment.deploy());
        allowlistAddress = `$ADDRESS_FOR_${this.allowlistAccessDeployment.name}`;
      }
      policies.push(allowlistAddress);
    }
    if (this.erc1155AccessDeployment.enabled()) {
      let erc1155Address = await this.erc1155AccessDeployment.currentAddress();
      if (!erc1155Address) {
        results = results.concat(await this.erc1155AccessDeployment.deploy());
        erc1155Address = `$ADDRESS_FOR_${this.erc1155AccessDeployment.name}`;
      }
      policies.push(erc1155Address);
    }
    if (this.allowanyAccessDeployment.enabled()) {
      let allowAnyAddress = await this.allowanyAccessDeployment.currentAddress();
      if (!allowAnyAddress) {
        results = results.concat(await this.allowanyAccessDeployment.deploy());
        allowAnyAddress = `$ADDRESS_FOR_${this.allowanyAccessDeployment.name}`;
      }
      policies.push(allowAnyAddress);
    }
    const accessManagerAddress = await this.currentAddress();
    if (!accessManagerAddress) {
      results.push({
        name: this.name,
        contractName: this.contractName,
        params: [await this.getWalletAddress(this.governance), policies],
        upgradeable: this.upgradeable,
      });
    }
    return Promise.resolve(results);
  }

  async getCurrentState(address: string): Promise<any> {
    const accessManager = (await ethers.getContractAt(AccessManagerABI, address)) as AccessControlManager;
    return await accessManager.getAccessControlPolicies();
  }

  async updateState(address: string, currentState: any): Promise<Array<ContractFunctionCall>> {
    let results = new Array<ContractFunctionCall>();
    const currentPolicies: string[] = currentState as string[];
    const wantPolicies: string[] = [];
    if (this.allowlistAccessDeployment.enabled()) {
      const addr = await this.allowlistAccessDeployment.currentAddress();
      if (!addr) {
        throw new Error(`No address found for contract ${this.allowlistAccessDeployment.contractName}. Please deploy it first.`);
      }
      results = results.concat(await this.allowlistAccessDeployment.update());
      wantPolicies.push(addr);
    }
    if (this.erc1155AccessDeployment.enabled()) {
      const addr = await this.erc1155AccessDeployment.currentAddress();
      if (!addr) {
        throw new Error(`No address found for contract ${this.erc1155AccessDeployment.contractName}. Please deploy it first.`);
      }
      results = results.concat(await this.erc1155AccessDeployment.update());
      wantPolicies.push(addr);
    }
    if (this.allowanyAccessDeployment.enabled()) {
      const addr = await this.allowanyAccessDeployment.currentAddress();
      if (!addr) {
        throw new Error(`No address found for contract ${this.allowanyAccessDeployment.contractName}. Please deploy it first.`);
      }
      results = results.concat(await this.allowanyAccessDeployment.update());
      wantPolicies.push(addr);
    }
    const policiesToAdd = wantPolicies.filter((p) => {
      return currentPolicies.indexOf(p) === -1;
    });
    if (policiesToAdd.length > 0) {
      results.push({
        abi: AccessManagerABI,
        address: address,
        methodName: "addAccessControlPolicies",
        params: [policiesToAdd],
        signer: this.governance,
      });
    }
    const policiesToRemove = currentPolicies.filter((p) => {
      return wantPolicies.indexOf(p) === -1;
    });
    if (policiesToRemove.length > 0) {
      results.push({
        abi: AccessManagerABI,
        address: address,
        methodName: "removeAccessControlPolicies",
        params: [policiesToRemove],
        signer: this.governance,
      });
    }
    return Promise.resolve(results);
  }
}
