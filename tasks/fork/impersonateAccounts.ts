import { task } from "hardhat/config";

import * as dotenv from "dotenv";
dotenv.config();

const BINANCE7_ADDRESS = "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8";
const BINANCE_RICH_DAI = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const DEVELOPMENT_WALLET = process.env.DEVELOPMENT_WALLET;

export default task("fork:impersonate-accounts", "Impersonate accounts").setAction(async (taskArguments, hre) => {
  console.log("Impersonate accounts...");

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [BINANCE7_ADDRESS],
  });

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [DEVELOPMENT_WALLET],
  });

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [BINANCE_RICH_DAI],
  });

  console.log("Finished!");
});
