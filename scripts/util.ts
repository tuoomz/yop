import hre, { ethers } from "hardhat";
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

  try {
    return Promise.resolve(JSON.parse(await fs.readFile(deploymentsFile, "utf8")));
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return {};
    } else {
      throw e;
    }
  }
}

// Write the latest deployment details to a deployment file
export async function writeDeploymentFile(env: string, data: any): Promise<void> {
  const deploymentsFile = await getDeploymentFile(env);
  await fsExtra.ensureFile(deploymentsFile);
  await fs.writeFile(deploymentsFile, JSON.stringify(data, null, 2) + "\n");
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
