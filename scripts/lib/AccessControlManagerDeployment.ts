import {
  ContractDeploymentCall,
  ContractDeploymentUpdate,
  ContractFunctionCall,
  DeployCommonArgs,
  Wallet,
  BaseConfig,
} from "./ContractDeployment";
import { AllowlistAccessControlDeployment, AllowlistAccessConfig } from "./AllowlistAccessControlDeployment";
import { ERC1155AccessControlDeployment, ERC1155AccessConfig } from "./ERC1155AccessControlDeployment";
import { AllowAnyAccessConfig, AllowAnyAccessControlDeployment } from "./AllowAnyAccessControlDeployment";
import AccessManagerABI from "../../abi/contracts/access/AccessControlManager.sol/AccessControlManager.json";

import { ethers } from "hardhat";
import { AccessControlManager } from "../../types/AccessControlManager";
import { SanctionlistAccessConfig, SanctionlistAccessControlDeployment } from "./SanctionlistAccessControlDeployment";
import { sameVersion } from "../util";

interface AccessManagerConfig extends BaseConfig {
  governance: Wallet;
  allowlist: AllowlistAccessConfig;
  erc1155: ERC1155AccessConfig;
  allowany: AllowAnyAccessConfig;
  sanctionlist: SanctionlistAccessConfig;
}

interface AccessControlManagerState {
  accessPolicies: string[];
  blockAccessPolicies: string[];
}

export class AccessControlManagerDeployment extends ContractDeploymentUpdate {
  name = "AccessControlManager";
  contractName = "AccessControlManager";
  upgradeable = false;
  governance: Wallet;
  allowlistAccessDeployment: AllowlistAccessControlDeployment;
  erc1155AccessDeployment: ERC1155AccessControlDeployment;
  allowanyAccessDeployment: AllowAnyAccessControlDeployment;
  sanctionlistAccessDeployment: SanctionlistAccessControlDeployment;
  constructor(commonArgs: DeployCommonArgs, args: AccessManagerConfig) {
    super(commonArgs, args.version);
    this.governance = args.governance;
    this.allowlistAccessDeployment = new AllowlistAccessControlDeployment(commonArgs, args.allowlist);
    this.erc1155AccessDeployment = new ERC1155AccessControlDeployment(commonArgs, args.erc1155);
    this.allowanyAccessDeployment = new AllowAnyAccessControlDeployment(commonArgs, args.allowany);
    this.sanctionlistAccessDeployment = new SanctionlistAccessControlDeployment(commonArgs, args.sanctionlist);
  }

  deployParams(): Promise<Array<any>> {
    return Promise.resolve(new Array<any>());
  }

  async deploy(): Promise<Array<ContractDeploymentCall>> {
    let results = new Array<ContractDeploymentCall>();
    const policies = new Array<string>();
    const blockPolicies = new Array<string>();
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
    if (this.sanctionlistAccessDeployment.enabled()) {
      let sanctionlistAddress = await this.sanctionlistAccessDeployment.currentAddress();
      if (!sanctionlistAddress) {
        results = results.concat(await this.sanctionlistAccessDeployment.deploy());
        sanctionlistAddress = `$ADDRESS_FOR_${this.sanctionlistAccessDeployment.name}`;
      }
      blockPolicies.push(sanctionlistAddress);
    }
    const accessManagerAddress = await this.currentAddress();
    if (!accessManagerAddress || !sameVersion(await this.deployedVersion(), this.version)) {
      results.push({
        name: this.name,
        contractName: this.contractName,
        params: [await this.getWalletAddress(this.governance), policies, blockPolicies],
        upgradeable: this.upgradeable,
        version: this.version,
      });
    }
    return Promise.resolve(results);
  }

  async getCurrentState(address: string): Promise<any> {
    const accessManager = (await ethers.getContractAt(AccessManagerABI, address)) as AccessControlManager;
    const accessPolicies = await accessManager.getAccessControlPolicies();
    const blockAccessPolicies = await accessManager.getBlockControlPolicies();
    return {
      accessPolicies: accessPolicies,
      blockAccessPolicies: blockAccessPolicies,
    };
  }

  async updateState(address: string, currentState: any): Promise<Array<ContractFunctionCall>> {
    let results = new Array<ContractFunctionCall>();
    let currentAccessPolicies: string[] = [];
    let currentBlockAccessPolicies: string[] = [];
    if (currentState) {
      const state = currentState as AccessControlManagerState;
      currentAccessPolicies = state.accessPolicies;
      currentBlockAccessPolicies = state.blockAccessPolicies;
    }
    const wantAccessPolicies: string[] = [];
    const wantBlockAccessPolicies: string[] = [];
    if (this.allowlistAccessDeployment.enabled()) {
      const addr = await this.allowlistAccessDeployment.currentAddress();
      if (!addr) {
        throw new Error(`No address found for contract ${this.allowlistAccessDeployment.contractName}. Please deploy it first.`);
      }
      results = results.concat(await this.allowlistAccessDeployment.update());
      wantAccessPolicies.push(addr);
    }
    if (this.erc1155AccessDeployment.enabled()) {
      const addr = await this.erc1155AccessDeployment.currentAddress();
      if (!addr) {
        throw new Error(`No address found for contract ${this.erc1155AccessDeployment.contractName}. Please deploy it first.`);
      }
      results = results.concat(await this.erc1155AccessDeployment.update());
      wantAccessPolicies.push(addr);
    }
    if (this.allowanyAccessDeployment.enabled()) {
      const addr = await this.allowanyAccessDeployment.currentAddress();
      if (!addr) {
        throw new Error(`No address found for contract ${this.allowanyAccessDeployment.contractName}. Please deploy it first.`);
      }
      results = results.concat(await this.allowanyAccessDeployment.update());
      wantAccessPolicies.push(addr);
    }
    if (this.sanctionlistAccessDeployment.enabled()) {
      const addr = await this.sanctionlistAccessDeployment.currentAddress();
      if (!addr) {
        throw new Error(`No address found for contract ${this.sanctionlistAccessDeployment.contractName}. Please deploy it first.`);
      }
      results = results.concat(await this.sanctionlistAccessDeployment.update());
      wantBlockAccessPolicies.push(addr);
    }
    const [accessPoliciesToAdd, accessPoliciesToRemove] = this.comparePolicies(currentAccessPolicies, wantAccessPolicies);
    if (accessPoliciesToAdd.length > 0) {
      results.push({
        abi: AccessManagerABI,
        address: address,
        methodName: "addAccessControlPolicies",
        params: [accessPoliciesToAdd],
        signer: this.governance,
      });
    }
    if (accessPoliciesToRemove.length > 0) {
      results.push({
        abi: AccessManagerABI,
        address: address,
        methodName: "removeAccessControlPolicies",
        params: [accessPoliciesToRemove],
        signer: this.governance,
      });
    }
    const [blockPoliciesToAdd, blockPoliciesToRemove] = this.comparePolicies(currentBlockAccessPolicies, wantBlockAccessPolicies);
    if (blockPoliciesToAdd.length > 0) {
      results.push({
        abi: AccessManagerABI,
        address: address,
        methodName: "addBlockControlPolicies",
        params: [accessPoliciesToAdd],
        signer: this.governance,
      });
    }
    if (blockPoliciesToRemove.length > 0) {
      results.push({
        abi: AccessManagerABI,
        address: address,
        methodName: "removeBlockControlPolicies",
        params: [accessPoliciesToRemove],
        signer: this.governance,
      });
    }
    return Promise.resolve(results);
  }

  comparePolicies(existing: string[], want: string[]): [string[], string[]] {
    const policiesToAdd = want.filter((p) => {
      return existing.indexOf(p) === -1;
    });
    const policiesToRemove = existing.filter((p) => {
      return want.indexOf(p) === -1;
    });
    return [policiesToAdd, policiesToRemove];
  }
}
