import hre from "hardhat";
import fsExtra from "fs-extra";
import path from "path";
import { promises as fs } from "fs";
import assert from "assert";

const NETWORK_NAME = hre.network.name;

// Read deployment file
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
