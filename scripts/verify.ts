import hre from "hardhat";
import { expect } from "chai";
import yargs from "yargs/yargs";

import { readDeploymentFile, verifyEnvVar } from "./util";

const requireEnvVar = ["ETHERSCAN_API_KEY"];
verifyEnvVar(requireEnvVar);

const argv = yargs(process.argv.slice(2))
  .options({
    env: { type: "string", default: "", describe: "the environment id" },
  })
  .parseSync();

async function main(): Promise<void> {
  const env = argv.env;
  if (!env) {
    throw new Error("no environment");
  }
  const deployRecord = await readDeploymentFile(env);

  for (const key in deployRecord) {
    console.log(`VERIFY :: ${key}`);
    const deployAddress = deployRecord[key].proxy ? deployRecord[key].implementationAddress : deployRecord[key].address;
    const deployArgs = deployRecord[key].proxy ? [] : deployRecord[key].contractParams;
    await verify(deployAddress, deployArgs);
    console.log(`VERIFIED :: ${key}`);
  }
}

async function verify(address: string, args: Array<string>) {
  // This fails a lot and why it is not bundled with deploy scripts
  try {
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: args,
    });
  } catch (error: any) {
    expect(error.message.toLowerCase()).contains("already verified");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
