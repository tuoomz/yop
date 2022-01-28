import { ethers } from "hardhat";
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { readDeploymentFile } from "../util";
import { randomBytes } from "crypto";

export type DefaultWallet = {
  type: string;
  index: number;
};

export type MultisigWallet = {
  type: string;
  address: string;
  safe: string;
};

// TODO: can add another type to load private & public key
export type Wallet = DefaultWallet | MultisigWallet;

export type DeploymentRecord = {
  address: string;
  proxy: boolean;
  deployTransaction: TransactionResponse;
  contractParams: Array<any>;
  configuration: any;
};

export type ContractDeploymentCall = {
  name: string;
  contractName: string;
  upgradeable: boolean;
  params: Array<any>;
};

export type ContractFunctionCall = {
  abi: any;
  address: string;
  methodName: string;
  params: Array<any>;
  signer: Wallet;
};

export interface IContractDeployment {
  deploy(): Promise<Array<ContractDeploymentCall>>;
}

export interface IContractUpdate {
  update(): Promise<Array<ContractFunctionCall>>;
}

export abstract class ContractDeploymentUpdate implements IContractDeployment, IContractUpdate {
  abstract contractName: string;
  abstract name: string;
  abstract upgradeable: boolean;
  env: string;
  constructor(env: string) {
    this.env = env;
  }

  abstract deployParams(): Promise<Array<any>>;
  abstract getCurrentState(address: string): Promise<any>;
  abstract updateState(address: string, currentState: any): Promise<Array<ContractFunctionCall>>;
  async deploy(): Promise<Array<ContractDeploymentCall>> {
    const deployRecords: Record<string, DeploymentRecord> = await readDeploymentFile(this.env);
    const record = deployRecords[this.name];
    const results: Array<ContractDeploymentCall> = new Array<ContractDeploymentCall>();
    if (!record || !record.address) {
      const params = await this.deployParams();
      results.push({
        name: this.name,
        contractName: this.contractName,
        params: params,
        upgradeable: this.upgradeable,
      });
    }
    return Promise.resolve(results);
  }

  async update(): Promise<Array<ContractFunctionCall>> {
    const deployRecords: Record<string, DeploymentRecord> = await readDeploymentFile(this.env);
    const record = deployRecords[this.name];
    if (!record || !record.address) {
      throw new Error(`no deployment record for contract ${this.name}`);
    }
    const currentState = await this.getCurrentState(record.address);
    return this.updateState(record.address, currentState);
  }

  async deploymentRecords(): Promise<Record<string, DeploymentRecord>> {
    return await readDeploymentFile(this.env);
  }

  async currentAddress(): Promise<string | undefined> {
    const records = await this.deploymentRecords();
    if (records[this.name] && records[this.name].address) {
      return Promise.resolve(records[this.name].address);
    } else {
      return Promise.resolve(undefined);
    }
  }

  async getWalletAddress(wallet: Wallet): Promise<string> {
    if (wallet.type === "multisig") {
      return Promise.resolve((wallet as MultisigWallet).address);
    } else if (wallet.type === "default") {
      const w = wallet as DefaultWallet;
      const accounts = await ethers.getSigners();
      return Promise.resolve(accounts[w.index].address);
    } else {
      throw new Error("unsupported wallet type " + wallet.type);
    }
  }

  async getAddressByName(name: string): Promise<string | undefined> {
    const records = await this.deploymentRecords();
    if (records[name] && records[name].address) {
      return Promise.resolve(records[name].address);
    } else {
      return Promise.resolve(undefined);
    }
  }

  async getAddressByNameOrRandom(name: string): Promise<string> {
    let address = await this.getAddressByName(name);
    if (!address) {
      address = this.generateRandomAddress();
    }
    return Promise.resolve(address);
  }

  generateRandomAddress(): string {
    const id = randomBytes(32).toString("hex");
    const privateKey = "0x" + id;
    const wallet = new ethers.Wallet(privateKey);
    return wallet.address;
  }
}
