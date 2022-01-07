import hre from "hardhat";
import fsExtra from "fs-extra";
import path from "path";
import { promises as fs } from "fs";
import assert from "assert";

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

export async function readDeploymentFile(): Promise<any> {
  const deploymentsFile = await getDeploymentFile();

  try {
    return JSON.parse(await fs.readFile(deploymentsFile, "utf8"));
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return {};
    } else {
      throw e;
    }
  }
}

// Write the latest deployment details to a deployment file
export async function writeDeploymentFile(data: any): Promise<void> {
  const deploymentsFile = await getDeploymentFile();
  await fsExtra.ensureFile(deploymentsFile);
  await fs.writeFile(deploymentsFile, JSON.stringify(data, null, 2) + "\n");
}

// Write the latest deployment details to a deployment file
export async function verifyEnvVar(required: Array<string>): Promise<void> {
  required.forEach((envVar: string) => assert(process.env[envVar], `Required env var: ${envVar}`));
}

// Deployment file per network
async function getDeploymentFile() {
  return path.join(`deployments/${NETWORK_NAME}.json`);
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
