import hre from "hardhat";
import { expect } from "chai";

import { readDeploymentFile, verifyEnvVar } from "./util";

const requireEnvVar = ["ETHERSCAN_API_KEY"];
verifyEnvVar(requireEnvVar);

async function main(): Promise<void> {
  const deployRecord = await readDeploymentFile();

  for (const key in deployRecord) {
    if (!key.match(/Mock/i)) {
      console.log(`VERIFY :: ${key}`);
      const deployAddress = deployRecord[key].proxy ? deployRecord[key].implementationAddress : deployRecord[key].address;
      const deployArgs = deployRecord[key].proxy ? [] : deployRecord[key].contractParams;
      await verify(deployAddress, deployArgs);
      console.log(`VERIFIED :: ${key}`);
    } else {
      console.log("Skipping MOCK", key);
    }
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
