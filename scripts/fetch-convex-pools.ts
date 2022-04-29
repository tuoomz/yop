import yargs from "yargs/yargs";
import BoosterABI from "../test/abis/convexBooster.json";
import { ethers } from "hardhat";
import { readJSONFile, writeJSONFile } from "./util";

// This script is used to fetch all the convex pool info and store them in a JSON file.
// The file will then be used as part of the deployment script to figure out the correct pool id to use.

const CONVEX_BOOSTER_ADDRESS = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";

const argv = yargs(process.argv.slice(2))
  .options({
    out: { type: "string", default: "./deployments/convex-pools.json", describe: "the path to the output file" },
  })
  .parseSync();

async function main() {
  const output = argv.out;
  const existing = (await readJSONFile(output)) || {};
  const existingPoolLength = existing.poolLength || 0;
  const existingPools = existing.pools || {};
  const boosterContract = await ethers.getContractAt(BoosterABI, CONVEX_BOOSTER_ADDRESS);
  const poolLength = (await boosterContract.poolLength()).toNumber();
  if (poolLength !== existingPoolLength) {
    // there are new pools we need to fetch
    for (let i = existingPoolLength; i < poolLength; i++) {
      console.log("load convex pool info with id ", i);
      const info = await boosterContract.poolInfo(i);
      existingPools[info.lptoken.toLowerCase()] = { ...info, poolId: i };
    }
    existing.poolLength = poolLength;
    existing.pools = existingPools;
    await writeJSONFile(output, existing);
    console.log("Convex pool info saved to ", output);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
