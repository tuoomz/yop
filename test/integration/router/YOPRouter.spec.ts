import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { SingleAssetVaultV2, StakingV2 } from "../../../types";
import { CONST } from "../../constants";
import { prepareUseAccount, reset, setupVaultV2, transferERC20Tokens } from "../shared/setup";
import { YOPRouter } from "../../../types/YOPRouter";
import { Contract } from "ethers";
import ERC20ABI from "../../../abi/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json";
import { minutesInSeconds } from "../../utils/time";

const TEN_THOUSANDS = ethers.utils.parseUnits("10000", CONST.TOKENS.USDC.DECIMALS);

describe("YOPRouter [@skip-on-coverage]", async () => {
  let vault: SingleAssetVaultV2;
  let governance: SignerWithAddress;
  let user1: SignerWithAddress;
  let yopStaking: StakingV2;
  let yopRouter: YOPRouter;
  let usdcContract: Contract;
  let yopContract: Contract;

  beforeEach(async () => {
    await reset(14212231);
    ({ vault, governance, yopStaking, yopRouter } = await setupVaultV2(CONST.TOKENS.USDC.ADDRESS));
    await vault.connect(governance).unpause();
    [user1] = (await ethers.getSigners()).reverse();
    await prepareUseAccount(user1, CONST.TOKENS.USDC.ADDRESS, CONST.TOKENS.USDC.WHALE, TEN_THOUSANDS, undefined, undefined, yopRouter.address);
    usdcContract = await ethers.getContractAt(ERC20ABI, CONST.TOKENS.USDC.ADDRESS);
    yopContract = await ethers.getContractAt(ERC20ABI, CONST.TOKENS.YOP.ADDRESS);
  });

  describe("swap and stake", async () => {
    it("can swap USDC to YOP and stake", async () => {
      expect(await yopStaking.balanceOf(user1.address, 0)).to.equal(ethers.constants.Zero);
      const usdcAmount = ethers.utils.parseUnits("2000", CONST.TOKENS.USDC.DECIMALS);
      const expectedYopAmount = await yopRouter.previewSwap(CONST.TOKENS.USDC.ADDRESS, usdcAmount, CONST.TOKENS.YOP.ADDRESS);
      const existingYopAmount = ethers.utils.parseUnits("5000", CONST.TOKENS.YOP.DECIMALS);
      await expect(
        await yopRouter
          .connect(user1)
          .swapAndStakeERC20(CONST.TOKENS.USDC.ADDRESS, usdcAmount, expectedYopAmount, existingYopAmount, 12, minutesInSeconds(20), [
            vault.address,
          ])
      )
        .to.emit(usdcContract, "Transfer")
        .withArgs(user1.address, yopRouter.address, usdcAmount)
        .to.emit(yopContract, "Transfer")
        .withArgs(user1.address, yopRouter.address, existingYopAmount)
        .to.emit(yopContract, "Transfer")
        .withArgs(yopRouter.address, yopStaking.address, expectedYopAmount.add(existingYopAmount));
      expect(await yopStaking.balanceOf(user1.address, 0)).to.equal(ethers.constants.One);
      expect((await yopStaking.stakes(0)).amount).to.gte(expectedYopAmount.add(existingYopAmount).toNumber());
    });

    it("can swap ETH to YOP and stake", async () => {
      expect(await yopStaking.balanceOf(user1.address, 0)).to.equal(ethers.constants.Zero);
      const ethAmount = ethers.utils.parseEther("1");
      const expectedYopAmount = await yopRouter.previewSwap(CONST.WETH_ADDRESS, ethAmount, CONST.TOKENS.YOP.ADDRESS);
      const existingYopAmount = ethers.utils.parseUnits("5000", CONST.TOKENS.YOP.DECIMALS);
      await expect(
        await yopRouter.connect(user1).swapAndStakeETH(expectedYopAmount, existingYopAmount, 12, minutesInSeconds(20), [vault.address], {
          value: ethAmount,
        })
      )
        .to.changeEtherBalance(user1, ethAmount.mul(-1))
        .to.emit(yopContract, "Transfer")
        .withArgs(user1.address, yopRouter.address, existingYopAmount)
        .to.emit(yopContract, "Transfer")
        .withArgs(yopRouter.address, yopStaking.address, expectedYopAmount.add(existingYopAmount));
      expect(await yopStaking.balanceOf(user1.address, 0)).to.equal(ethers.constants.One);
      expect((await yopStaking.stakes(0)).amount).to.gte(expectedYopAmount.add(existingYopAmount).toNumber());
    });
  });

  describe("swap and deposit", async () => {
    let wbtcContract: Contract;

    beforeEach(async () => {
      await transferERC20Tokens(
        CONST.TOKENS.WBTC.ADDRESS,
        CONST.TOKENS.WBTC.WHALE,
        user1.address,
        ethers.utils.parseUnits("2", CONST.TOKENS.WBTC.DECIMALS)
      );
      wbtcContract = await ethers.getContractAt(ERC20ABI, CONST.TOKENS.WBTC.ADDRESS);
      await wbtcContract.connect(user1).approve(yopRouter.address, ethers.constants.MaxUint256);
    });

    it("can swap WBTC to USDC and stake", async () => {
      expect(await vault.balanceOf(user1.address)).to.equal(ethers.constants.Zero);
      const wbtcAmount = ethers.utils.parseUnits("1", CONST.TOKENS.WBTC.DECIMALS);
      const expectedUSDCAmount = await yopRouter.previewSwap(CONST.TOKENS.WBTC.ADDRESS, wbtcAmount, CONST.TOKENS.USDC.ADDRESS);
      const existingUSDCAmount = ethers.utils.parseUnits("5000", CONST.TOKENS.USDC.DECIMALS);
      await expect(
        await yopRouter
          .connect(user1)
          .swapAndDepositERC20(
            CONST.TOKENS.WBTC.ADDRESS,
            wbtcAmount,
            CONST.TOKENS.USDC.ADDRESS,
            expectedUSDCAmount,
            existingUSDCAmount,
            minutesInSeconds(20)
          )
      )
        .to.emit(wbtcContract, "Transfer")
        .withArgs(user1.address, yopRouter.address, wbtcAmount)
        .to.emit(usdcContract, "Transfer")
        .withArgs(user1.address, yopRouter.address, existingUSDCAmount)
        .to.emit(usdcContract, "Transfer")
        .withArgs(yopRouter.address, vault.address, expectedUSDCAmount.add(existingUSDCAmount));
      expect(await vault.balanceOf(user1.address)).to.gt(ethers.constants.Zero);
    });

    it("can swap ETH to USDC and deposit", async () => {
      expect(await vault.balanceOf(user1.address)).to.equal(ethers.constants.Zero);
      const ethAmount = ethers.utils.parseEther("1");
      const expectedUSDCAmount = await yopRouter.previewSwap(CONST.WETH_ADDRESS, ethAmount, CONST.TOKENS.USDC.ADDRESS);
      const existingUSDCAmount = ethers.utils.parseUnits("5000", CONST.TOKENS.USDC.DECIMALS);
      await expect(
        await yopRouter
          .connect(user1)
          .swapAndDepositETH(CONST.TOKENS.USDC.ADDRESS, expectedUSDCAmount, existingUSDCAmount, minutesInSeconds(20), {
            value: ethAmount,
          })
      )
        .to.changeEtherBalance(user1, ethAmount.mul(-1))
        .to.emit(usdcContract, "Transfer")
        .withArgs(user1.address, yopRouter.address, existingUSDCAmount)
        .to.emit(usdcContract, "Transfer")
        .withArgs(yopRouter.address, vault.address, expectedUSDCAmount.add(existingUSDCAmount));
      expect(await vault.balanceOf(user1.address)).to.gt(ethers.constants.One);
    });
  });
});
