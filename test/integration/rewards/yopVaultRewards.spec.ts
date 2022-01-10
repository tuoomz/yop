import { expect } from "chai";
import { setupVault, impersonate, setEthBalance, setNextBlockTimestamp } from "../shared/setup";
import { ethers } from "hardhat";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import IWethABI from "../../../abi/contracts/interfaces/IWeth.sol/IWETH.json";
import { IWETH } from "../../../types";
import { YOPVaultRewards } from "../../../types/YOPVaultRewards";
import { BigNumber } from "ethers";

const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const WETH_WHALE_ADDRESS = "0x2f0b23f53734252bda2277357e97e1517d6b042a";
const INITIAL_RATE = 34255400000000;
const ONE_UNIT = 100000000;
const SECONDS_PER_MONTH = 2629743;
let blockTime = Math.round(new Date().getTime() / 1000);
let currentEmissionRate = INITIAL_RATE;

describe("yopVaultRewards [@skip-on-coverage]", async () => {
  let vault: SingleAssetVault;
  let governance: SignerWithAddress;
  let yopRewards: YOPVaultRewards;
  let user: SignerWithAddress;
  let user2: SignerWithAddress;
  let wethContract: IWETH;

  beforeEach(async () => {
    // setup the vault
    ({ vault, governance, yopRewards } = await setupVault(WETH_ADDRESS));
    // deploy the strategy
    [user, user2] = (await ethers.getSigners()).reverse();
    await vault.connect(governance).unpause();

    // send some weth to the user
    wethContract = (await ethers.getContractAt(IWethABI, WETH_ADDRESS)) as IWETH;
    await setEthBalance(WETH_WHALE_ADDRESS, ethers.utils.parseEther("10"));
    await wethContract.connect(await impersonate(WETH_WHALE_ADDRESS)).transfer(user.address, ethers.utils.parseEther("100"));
    await wethContract.connect(user).approve(vault.address, ethers.constants.MaxUint256);
  });

  describe("check yop rewards amount", async () => {
    const depositAmount = ethers.utils.parseEther("100");

    it("should only claim rewards from when liquidity is provided", async () => {
      blockTime += SECONDS_PER_MONTH; // 1 month later
      currentEmissionRate = INITIAL_RATE * 0.99;
      const expectedRewards = Math.round((currentEmissionRate / SECONDS_PER_MONTH) * 60 * 60 * 2);
      await setNextBlockTimestamp(blockTime);
      // deposit to the vault a month after the rewards emission begins
      await vault.connect(user).deposit(depositAmount, user.address);
      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);
      // withdraw after 2 hours
      await vault.connect(user).withdraw(ethers.constants.MaxUint256, user.address, 100);
      const claimableRewards = await yopRewards.connect(user).allUnclaimedRewards();
      // rewards should be for only the 2 hours that liquidity was provided
      expect(claimableRewards).to.closeTo(BigNumber.from(expectedRewards), ONE_UNIT);
    });

    it("should update rewards when vault LP tokens are transferred", async () => {
      blockTime += 15;
      await setNextBlockTimestamp(blockTime);
      await vault.connect(user).deposit(depositAmount, user.address);
      const b1 = await vault.balanceOf(user.address);
      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);
      // after 2 hours, transfer half of the LP tokens to another user
      await vault.connect(user).transfer(user2.address, b1.div(2));
      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);
      // both withdraw after 2 hours
      await vault.connect(user).withdraw(ethers.constants.MaxUint256, user.address, 100);
      await vault.connect(user2).withdraw(ethers.constants.MaxUint256, user.address, 100);
      // user 1 rewards: full emission for the first 2 hours + half of the mission for the 2 hours
      const expectedUserRewards = Math.round(
        (currentEmissionRate * 60 * 60 * 2) / SECONDS_PER_MONTH + ((currentEmissionRate / 2) * 60 * 60 * 2) / SECONDS_PER_MONTH
      );
      const userClaimableRewards = await yopRewards.connect(user).allUnclaimedRewards();
      expect(userClaimableRewards).to.closeTo(BigNumber.from(expectedUserRewards), ONE_UNIT);
      // user 2 rewards: half of the missions for 2 hours
      const expectedUser2Rewards = Math.round((currentEmissionRate / 2 / SECONDS_PER_MONTH) * 60 * 60 * 2);
      const user2ClaimableRewards = await yopRewards.connect(user2).allUnclaimedRewards();
      expect(user2ClaimableRewards).to.closeTo(BigNumber.from(expectedUser2Rewards), ONE_UNIT);
    });
  });
});
