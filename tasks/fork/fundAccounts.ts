import { dai, usdc } from "@studydefi/money-legos/erc20";

import { task } from "hardhat/config";

const BINANCE7_ADDRESS = "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8"; // Random account with large sums of tokens
const BINANCE_RICH_DAI = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0"; // Random account with large sums of tokens
const DEVELOPMENT_WALLET = process.env.DEVELOPMENT_WALLET;

export default task("fork:fetch-funds-from-binance", "Distribute funds from Binance").setAction(async (taskArguments, hre) => {
  console.log("Gathering funds from Binance...");

  const { ethers } = hre;
  const { provider, getContractAt, utils } = ethers;
  const { parseEther: toWei } = utils;

  console.log("Gathering funds for ETH, DAI and USDC");
  const binance = provider.getSigner(BINANCE7_ADDRESS);
  const binanceDai = provider.getSigner(BINANCE_RICH_DAI);

  const daiContract = await getContractAt(dai.abi, dai.address, binanceDai);
  const usdcContract = await getContractAt(usdc.abi, usdc.address);

  console.log(`Sending 1000 Eth to ${DEVELOPMENT_WALLET}...`);
  await binance.sendTransaction({ to: DEVELOPMENT_WALLET, value: toWei("1000") });

  console.log(`Sending 1000 DAI to ${DEVELOPMENT_WALLET}...`);
  await daiContract.transfer(DEVELOPMENT_WALLET, toWei("1000"));

  console.log(`Sending 1000 USDC to ${DEVELOPMENT_WALLET}...`);
  const binanceApprove = usdcContract.connect(binance);
  await binanceApprove.approve(BINANCE7_ADDRESS, ethers.utils.parseUnits("1000", 6));
  await binanceApprove.transferFrom(BINANCE7_ADDRESS, DEVELOPMENT_WALLET, ethers.utils.parseUnits("1000", 6));

  console.log("Finished");
});
