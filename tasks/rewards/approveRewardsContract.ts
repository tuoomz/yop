import { task } from "hardhat/config";

import { yop } from "../yop";

export default task("rewards:set-yop-allowance", "Set allowance of YOP tokens for the rewards contract")
  .addOptionalParam("yop", "YOP contract address", yop.address)
  .addParam("reward", "The reward contract address")
  .addParam("allowance", "The allowance value")
  .setAction(async (taskArguments, hre) => {
    const yopContractAddress = taskArguments.yop;
    const rewardAddress = taskArguments.reward;
    const allowance = taskArguments.allowance;
    const { ethers } = hre;
    const { Wallet, getContractAt } = ethers;
    // TODO: what's the best way to get the wallet? Can we use AWS secret store somehow?
    const wallet = await Wallet.fromEncryptedJson("", "");

    console.log(`Approving reward contract ${rewardAddress} to spend ${allowance} of YOP from wallet ${wallet.address}`);

    const yopContract = await getContractAt(yop.abi, yopContractAddress);
    await yopContract.connect(wallet).approve(rewardAddress, allowance);
  });
