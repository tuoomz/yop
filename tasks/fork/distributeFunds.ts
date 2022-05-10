import { dai, usdc } from "@studydefi/money-legos/erc20";
import { yop } from "../yop";

import { task } from "hardhat/config";
import { ETH_ADDRESS, USDC_ADDRESS, DAI_ADDRESS, YOP_ADDRESS } from "./accounts";

const DEVELOPMENT_WALLET = process.env.DEVELOPMENT_WALLET;

export default task("fork:distribute-funds", "Distribute funds from Binance")
  .addFlag("eth", "Disable all and fetch ETH")
  .addFlag("dai", "Disable all and fetch DAI")
  .addFlag("usdc", "Disable all and fetch USDC")
  .addFlag("yop", "Disable all and fetch YOP")
  .setAction(async (args, hre) => {
    console.log("Gathering funds from multiple accounts...");

    let all = false;
    if (!args.eth && !args.dai && !args.usdc && !args.yop) {
      all = true;
    }

    const { ethers } = hre;
    const { provider, getContractAt, utils } = ethers;
    const { parseEther: toWei } = utils;

    console.log("Gathering funds...");
    const binance7Eth = provider.getSigner(ETH_ADDRESS);
    const binance8Usdc = provider.getSigner(USDC_ADDRESS);
    const binance14Dai = provider.getSigner(DAI_ADDRESS);
    const yopReserve = provider.getSigner(YOP_ADDRESS);

    const daiContract = await getContractAt(dai.abi, dai.address, binance14Dai);
    const usdcContract = await getContractAt(usdc.abi, usdc.address, binance8Usdc);
    const yopContract = await getContractAt(yop.abi, yop.address, yopReserve);

    if (all || args.eth) {
      console.log(`Sending 1000 ETH to ${DEVELOPMENT_WALLET}...`);
      try {
        await binance7Eth.sendTransaction({ to: DEVELOPMENT_WALLET, value: toWei("1000") });
      } catch (e) {
        console.error("error: failed to transfer ETH: ", e);
      }
    }

    if (all || args.dai) {
      console.log(`Sending 1000 DAI to ${DEVELOPMENT_WALLET}...`);
      try {
        await daiContract.transfer(DEVELOPMENT_WALLET, toWei("1000"));
      } catch (e) {
        console.error("error: failed to transfer DAI: ", e);
      }
    }

    if (all || args.usdc) {
      console.log(`Sending 1000 USDC to ${DEVELOPMENT_WALLET}...`);
      try {
        await usdcContract.transfer(DEVELOPMENT_WALLET, ethers.utils.parseUnits("1000", 6));
      } catch (e) {
        console.error("error: failed to transfer USDC: ", e);
      }
    }

    if (all || args.yop) {
      console.log(`Sending 1000 YOP to ${DEVELOPMENT_WALLET}...`);
      try {
        // get some ETH to pay for the transaction
        await binance7Eth.sendTransaction({ to: YOP_ADDRESS, value: toWei("1") });
        // now transfer the YOP
        await yopContract.transfer(DEVELOPMENT_WALLET, ethers.utils.parseUnits("1000", 8));
      } catch (e) {
        console.error("error: failed to transfer YOP: ", e);
      }
    }

    console.log("Finished");
  });
