import hre, { ethers, network } from "hardhat";
import fsExtra from "fs-extra";
import path from "path";
import { promises as fs } from "fs";
import assert from "assert";
import { fetchConstant } from "../constants";

import { TransactionResponse } from "@ethersproject/abstract-provider";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const NETWORK_NAME = hre.network.name;

// Read deployment file
export function spaces(length: number): string {
  return new Array(length).fill(" ").join("");
}

export function address(contract: SignerWithAddress | Contract | string): string {
  return typeof contract === "string" ? contract : contract.address;
}

export function isDevelopmentNetwork(): boolean {
  return ["hardhat", "localhost"].includes(hre.network.name);
}

export async function readDeploymentFile(env: string = NETWORK_NAME): Promise<any> {
  const deploymentsFile = await getDeploymentFile(env);

  return await readJSONFile(deploymentsFile);
}

// Write the latest deployment details to a deployment file
export async function writeDeploymentFile(env: string, data: any): Promise<void> {
  const deploymentsFile = await getDeploymentFile(env);
  await writeJSONFile(deploymentsFile, data);
}

// Write the latest deployment details to a deployment file
export async function verifyEnvVar(required: Array<string>): Promise<void> {
  required.forEach((envVar: string) => assert(process.env[envVar], `Required env var: ${envVar}`));
}

// Deployment file per network
async function getDeploymentFile(env: string = NETWORK_NAME) {
  return path.join(`deployments/${env}.json`);
}

export async function getTxn(transactionResponse: TransactionResponse) {
  const txn = await transactionResponse.wait();
  return {
    ...transactionResponse,
    ...txn,
    gasPrice: transactionResponse.gasPrice?.toString(),
    gasLimit: transactionResponse.gasLimit.toString(),
    value: transactionResponse.value.toString(),
    gasUsed: txn.gasUsed.toString(),
    cumulativeGasUsed: txn.cumulativeGasUsed.toString(),
  };
}

export async function getRolesAddresses(): Promise<Record<string, SignerWithAddress | string>> {
  let GOVERNANCE;
  let GATEKEEPER;
  let STRATEGIST;
  let HARVESTER;

  if (isDevelopmentNetwork()) {
    [, GOVERNANCE, GATEKEEPER, STRATEGIST, HARVESTER] = await ethers.getSigners();
  }
  if (hre.network.name === "mainnet") {
    // These are our MULTISIG gnosis-safe wallets. Env Var can be used to override for development
    GOVERNANCE = fetchConstant("multisig", "yopGovernance");
    GATEKEEPER = fetchConstant("multisig", "yopGatekeeper");
    STRATEGIST = fetchConstant("multisig", "yopStrategist");
    HARVESTER = fetchConstant("multisig", "yopHarvester");
  }
  const YOP = fetchConstant("addresses", "yop_address");
  const YOP_NFT_CONTRACT = fetchConstant("addresses", "yop_nft_contract_address");

  return {
    GOVERNANCE,
    GATEKEEPER,
    STRATEGIST,
    HARVESTER,
    YOP,
    YOP_NFT_CONTRACT,
  };
}

export function sameVersion(v1, v2): boolean {
  if (!v1 && v2) {
    return false;
  } else if (v1.toString() !== v2.toString()) {
    return false;
  }
  return true;
}

export async function impersonate(account: string): Promise<SignerWithAddress> {
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [account],
  });
  const signer = await ethers.getSigner(account);

  await network.provider.send("hardhat_setBalance", [
    account,
    "0x100000000000000000", // 2.9514791e+20 wei
  ]);

  return signer;
}

export function sameString(s1: string, s2: string): boolean {
  return s1.toLowerCase() === s2.toLowerCase();
}

export async function readJSONFile(file: string): Promise<any> {
  try {
    return Promise.resolve(JSON.parse(await fs.readFile(file, "utf8")));
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return {};
    } else {
      throw e;
    }
  }
}

export async function writeJSONFile(file: string, data: any): Promise<void> {
  await fsExtra.ensureFile(file);
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n");
}
