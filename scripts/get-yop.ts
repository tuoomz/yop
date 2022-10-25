// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the

import YOPTokenMockABI from "../abi/contracts/mocks/YOPTokenMock.sol/YOPTokenMock.json";

// global scope, and execute the script.
import { ethers } from "hardhat";
import { YOPTokenMock } from "../types/YOPTokenMock";

async function main() {
  const userAddress = "0xAD125617199AFF71939f05bC981B78A85DeE68fc";
  console.log("userAddress", userAddress);
  const WHALE = "0x14b2c7a6b000e4eda5f9287214e1857da1a44275";
  console.log("WHALE", WHALE);
  const [deployer] = await ethers.getSigners();
  // onst yopWhaleAccount = await impersonate(WHALE);
  // await setEthBalance(WHALE, ethers.utils.parseEther("10"));
  const yopContract = (await ethers.getContractAt(YOPTokenMockABI, "0xc40C64835D5f190348B18d823fA9A1149aEbd4d7")) as YOPTokenMock;
  const ONE_THOUSAND_YOP = ethers.utils.parseUnits("1000", 8);
  await yopContract.connect(deployer).mint(userAddress, ONE_THOUSAND_YOP);
  // await network.provider.send("evm_mine");
  console.log((await yopContract.balanceOf(userAddress)).toString());

  console.log("Done");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
