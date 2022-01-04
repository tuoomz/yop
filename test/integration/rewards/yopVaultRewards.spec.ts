import { expect } from "chai";
import { setupVault, impersonate, setEthBalance, jumpForward, setNextBlockTimestamp } from "../shared/setup";
import { ethers } from "hardhat";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import WethABI from "../../abis/weth.json";
import { IWETH } from "../../../types";
import { YOPVaultRewards } from "../../../types/YOPVaultRewards";
import { BigNumber } from "ethers";

const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const WETH_WHALE_ADDRESS = "0x2f0b23f53734252bda2277357e97e1517d6b042a";
const INITIAL_RATE = 34255400000000;
const ONE_UNIT = 100000000;
const SECONDS_PER_MONTH = 2629743;

describe("yopVaultRewards [@skip-on-coverage]", async () => {
  let vault: SingleAssetVault;
  let governance: SignerWithAddress;
  let yopRewards: YOPVaultRewards;
  let user: SignerWithAddress;
  let wethContract: IWETH;

  beforeEach(async () => {
    // setup the vault
    ({ vault, governance, yopRewards } = await setupVault(WETH_ADDRESS));
    // deploy the strategy
    [user] = (await ethers.getSigners()).reverse();
    await vault.connect(governance).unpause();

    // send some weth to the user
    wethContract = (await ethers.getContractAt(WethABI, WETH_ADDRESS)) as IWETH;
    await setEthBalance(WETH_WHALE_ADDRESS, ethers.utils.parseEther("10"));
    await wethContract.connect(await impersonate(WETH_WHALE_ADDRESS)).transfer(user.address, ethers.utils.parseEther("100"));
    await wethContract.connect(user).approve(vault.address, ethers.constants.MaxUint256);
  });

  describe("check yop rewards amount", async () => {
    const nowInSeconds = Math.round(new Date().getTime() / 1000);
    const depositAmount = ethers.utils.parseEther("100");

    it("should only claim rewards from when liquidity is provided", async () => {
      const t1 = nowInSeconds + SECONDS_PER_MONTH; // 1 month later
      const t2 = t1 + 60 * 60 * 2; // 2 hours
      const expectedRewards = Math.round(((INITIAL_RATE * 0.99) / SECONDS_PER_MONTH) * 60 * 60 * 2);
      await setNextBlockTimestamp(t1);
      // deposit to the vault a month after the rewards emission begins
      await vault.connect(user).deposit(depositAmount, user.address);
      await setNextBlockTimestamp(t2);
      // withdraw after 2 hours
      await vault.connect(user).withdraw(ethers.constants.MaxUint256, user.address, 100);
      const claimableRewards = await yopRewards.connect(user).allUnclaimedRewards();
      // rewards should be for only the 2 hours that liquidity was provided
      expect(claimableRewards).to.closeTo(BigNumber.from(expectedRewards), ONE_UNIT);
    });
  });
});
