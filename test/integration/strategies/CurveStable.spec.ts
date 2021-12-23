import { expect } from "chai";
import { setupVault, impersonate, setEthBalance, jumpForward } from "../shared/setup";
import { ethers, waffle } from "hardhat";
import { BigNumber } from "ethers";

import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { VaultStrategyDataStore } from "../../../types/VaultStrategyDataStore";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import ERC20ABI from "../../../abi/ERC20.json";
import CurveBasePoolABI from "../../abis/curvePlainPoolTrio.json";
import { ICurveDeposit } from "../../../types/ICurveDeposit";
import { CurveStable, ERC20 } from "../../../types";

const USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const CURVE_DAI_USDC_USDT_POOL_ADDRESS = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
const CURVE_USDN_META_POOL_ADDRESS = "0x0f9cb53Ebe405d49A0bbdBD291A65Ff571bC83e1";

const USDC_WHALE_ADDRESS = "0x7e9e4c0876B2102F33A1d82117Cc73B7FddD0032";
const USDC_DECIMALS = 6;

describe("CurveStableStrategy [@skip-on-coverage]", async () => {
  let vault: SingleAssetVault;
  let vaultStrategyDataStore: VaultStrategyDataStore;
  let governance: SignerWithAddress;
  let rewards: SignerWithAddress;
  let curveStrategy: CurveStable;
  let strategist: SignerWithAddress;
  let keeper: SignerWithAddress;
  let user: SignerWithAddress;
  let usdcContract: ERC20;
  let curveStableTriPool: ICurveDeposit;
  let curveMetaPool: ICurveDeposit;
  let depositAmount: BigNumber;
  let allocatedFund: BigNumber;
  beforeEach(async () => {
    // setup the vault
    ({ vault, vaultStrategyDataStore, governance, rewards } = await setupVault(USDC_ADDRESS));
    // deploy the strategy
    [strategist, keeper, user] = (await ethers.getSigners()).reverse();
    const strategyFactory = await ethers.getContractFactory("CurveStable");
    curveStrategy = (await strategyFactory.deploy(
      vault.address,
      strategist.address,
      rewards.address,
      keeper.address,
      CURVE_DAI_USDC_USDT_POOL_ADDRESS
    )) as CurveStable;
    // add the strategy to the vault
    await vaultStrategyDataStore
      .connect(governance)
      .addStrategy(vault.address, curveStrategy.address, 9000, ethers.constants.Zero, ethers.constants.MaxUint256, 100);
    await vault.connect(governance).unpause();

    // send some weth to the user
    usdcContract = (await ethers.getContractAt(ERC20ABI, USDC_ADDRESS)) as ERC20;
    await setEthBalance(USDC_WHALE_ADDRESS, ethers.utils.parseEther("10"));
    await usdcContract.connect(user).approve(vault.address, ethers.constants.MaxUint256);
    depositAmount = ethers.utils.parseUnits("1000", USDC_DECIMALS);
    allocatedFund = ethers.utils.parseUnits("900", USDC_DECIMALS); // 90% ratio
    await usdcContract.connect(await impersonate(USDC_WHALE_ADDRESS)).transfer(user.address, depositAmount);
    // get an instance of the pool contract
    curveStableTriPool = (await ethers.getContractAt(CurveBasePoolABI, CURVE_DAI_USDC_USDT_POOL_ADDRESS)) as ICurveDeposit;
    curveMetaPool = (await ethers.getContractAt(CurveBasePoolABI, CURVE_USDN_META_POOL_ADDRESS)) as ICurveDeposit;
  });

  describe("happy path", async () => {
    it("normal operation", async () => {
      // deposit the funds and verify that the funds are transferred
      expect(await usdcContract.balanceOf(user.address)).to.equal(depositAmount);
      expect(await vault.balanceOf(user.address)).to.equal(ethers.constants.Zero);
      await vault.connect(user).deposit(depositAmount, user.address);
      expect(await usdcContract.balanceOf(user.address)).to.equal(ethers.constants.Zero);
      expect(await usdcContract.balanceOf(vault.address)).to.equal(depositAmount);
      expect(await vault.balanceOf(user.address)).to.gt(ethers.constants.Zero);
      const before = await usdcContract.balanceOf(curveStableTriPool.address);
      await expect(await curveStrategy.connect(governance).harvest())
        // allocated to the strategy
        .to.emit(usdcContract, "Transfer")
        .withArgs(vault.address, curveStrategy.address, allocatedFund)
        // transferred to the zap depositor
        .to.emit(usdcContract, "Transfer")
        .withArgs(curveStrategy.address, curveStableTriPool.address, allocatedFund);
      // tried to use "to.emit" to check the transfer event from zap to the base pool, but it keeps failing.
      // however, checking the event logs and the balance and the events are reported. So might be a bug with the library itself.
      const after = await usdcContract.balanceOf(curveStableTriPool.address);
      // fund is added to the pool
      expect(after.sub(before)).to.equal(allocatedFund);

      await jumpForward(60 * 60 * 24); // 1 day
      await curveStrategy.connect(governance).harvest();
      const estimatedTotal = ethers.utils.formatUnits(await curveStrategy.estimatedTotalAssets(), USDC_DECIMALS);
      // it's not going to make any profit as there is fee charged by Curve, so just check it is within certain range.
      expect(parseFloat(estimatedTotal)).to.be.closeTo(parseFloat(ethers.utils.formatUnits(allocatedFund, USDC_DECIMALS)), 1);
    });

    it("emergency withdraw", async () => {
      await vault.connect(user).deposit(depositAmount, user.address);
      await expect(async () => await curveStrategy.connect(governance).harvest()).to.changeTokenBalance(
        usdcContract,
        curveStableTriPool,
        allocatedFund
      );
      await curveStrategy.connect(governance).setEmergencyExit();
      const beforeBalance = await usdcContract.balanceOf(vault.address);
      await curveStrategy.connect(governance).harvest();
      const afterBalance = await usdcContract.balanceOf(vault.address);
      const diff = afterBalance.sub(beforeBalance);
      expect(parseFloat(ethers.utils.formatUnits(diff, USDC_DECIMALS))).to.be.closeTo(
        parseFloat(ethers.utils.formatUnits(allocatedFund, USDC_DECIMALS)),
        1
      );
    });
  });
});
