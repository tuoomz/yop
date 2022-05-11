import { task } from "hardhat/config";

import * as dotenv from "dotenv";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ETH_ADDRESS, USDC_ADDRESS, DAI_ADDRESS, YOP_ADDRESS, WETH_ADDRESS, WBTC_ADDRESS } from "./accounts";
dotenv.config();

async function impersonateAccount(hre: HardhatRuntimeEnvironment, account: string | undefined) {
  console.log(`Impersonate account: ${account}...`);

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [account],
  });
}

export default task("fork:impersonate-accounts", "Impersonate accounts").setAction(async (taskArguments, hre) => {
  console.log("Impersonate accounts...");

  const accounts = [ETH_ADDRESS, WETH_ADDRESS, WBTC_ADDRESS, USDC_ADDRESS, DAI_ADDRESS, YOP_ADDRESS];

  for (const account of accounts) {
    await impersonateAccount(hre, account);
  }

  console.log("Finished!");
});
