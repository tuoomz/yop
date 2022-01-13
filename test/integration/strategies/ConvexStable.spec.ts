import { expect } from "chai";
import { setupVault, impersonate, setEthBalance, jumpForward } from "../shared/setup";
import { ethers } from "hardhat";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { VaultStrategyDataStore } from "../../../types/VaultStrategyDataStore";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ConvexEth } from "../../../types/ConvexEth";
import usdcABI from "../../abis/coins/usdc.json";
import { IConvexRewards, IConvexDeposit, ERC20 } from "../../../types";
import CurvePlainPoolABI from "../../abis/curvePlainPool.json";
import ConvexRewardsABI from "../../abis/convexBaseRewards.json";
import ConvexBoosterABI from "../../abis/convexBooster.json";
import { ICurveDeposit } from "../../../types/ICurveDeposit";
import { BigNumber } from "ethers";

const USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDC_WHALE_ADDRESS = "0x0a59649758aa4d66e25f08dd01271e891fe52199";
const CURVE_3POOL_ADDRESS = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
const CURVE_3POOL_TOKEN_ADDRESS = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
const CONVEX_BOOSTER_ADDRESS = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const CONVEX_REWARD_CONTRACT_ADDRESS = "0x4a2631d090e8b40bBDe245e687BF09e5e534A239";
const USDC_DECIMALS = 6;

describe("ConvexStable [@skip-on-coverage]", async () => {
  let vault: SingleAssetVault;
  let vaultStrategyDataStore: VaultStrategyDataStore;
  let governance: SignerWithAddress;
  let convexStableStrategy: ConvexEth;
  let proposer: SignerWithAddress;
  let developer: SignerWithAddress;
  let keeper: SignerWithAddress;
  let user: SignerWithAddress;
  let usdcContract: ERC20;
  let curve3PoolTokenContract: ERC20;
  let curve3Pool: ICurveDeposit;
  let convexRewards: IConvexRewards;
  let convexBooster: IConvexDeposit;
  let depositAmount: BigNumber;
  let allocatedFund: BigNumber;

  beforeEach(async () => {
    // setup the vault
    ({ vault, vaultStrategyDataStore, governance } = await setupVault(USDC_ADDRESS));
    // deploy the strategy
    [proposer, developer, keeper, user] = (await ethers.getSigners()).reverse();
    const ConvexStableStrategyFactory = await ethers.getContractFactory("ConvexStable");
    convexStableStrategy = (await ConvexStableStrategyFactory.deploy(
      vault.address,
      proposer.address,
      developer.address,
      keeper.address,
      CURVE_3POOL_ADDRESS,
      CONVEX_BOOSTER_ADDRESS
    )) as ConvexEth;
    // add the strategy to the vault
    await vaultStrategyDataStore
      .connect(governance)
      .addStrategy(vault.address, convexStableStrategy.address, 9000, ethers.constants.Zero, ethers.constants.MaxUint256, 100);
    await vault.connect(governance).unpause();

    // send some usdc to the user
    depositAmount = ethers.utils.parseUnits("1000", USDC_DECIMALS);
    allocatedFund = ethers.utils.parseUnits("900", USDC_DECIMALS); // 90% ratio
    usdcContract = (await ethers.getContractAt(usdcABI, USDC_ADDRESS)) as ERC20;
    curve3PoolTokenContract = (await ethers.getContractAt(usdcABI, CURVE_3POOL_TOKEN_ADDRESS)) as ERC20;
    await setEthBalance(USDC_WHALE_ADDRESS, ethers.utils.parseEther("10"));
    await usdcContract.connect(await impersonate(USDC_WHALE_ADDRESS)).transfer(user.address, depositAmount);
    await usdcContract.connect(user).approve(vault.address, ethers.constants.MaxUint256);

    // get an instance of the pool contract
    curve3Pool = (await ethers.getContractAt(CurvePlainPoolABI, CURVE_3POOL_ADDRESS)) as ICurveDeposit;
    convexRewards = (await ethers.getContractAt(ConvexRewardsABI, CONVEX_REWARD_CONTRACT_ADDRESS)) as IConvexRewards;
    convexBooster = (await ethers.getContractAt(ConvexBoosterABI, CONVEX_BOOSTER_ADDRESS)) as IConvexDeposit;
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
      expect(await convexRewards.balanceOf(convexStableStrategy.address)).to.equal(ethers.constants.Zero);
      const before = await usdcContract.balanceOf(curve3Pool.address);
      await expect(await convexStableStrategy.connect(governance).harvest())
        // allocated to the strategy
        .to.emit(usdcContract, "Transfer")
        .withArgs(vault.address, convexStableStrategy.address, allocatedFund)
        // transferred to the zap depositor
        .to.emit(usdcContract, "Transfer")
        .withArgs(convexStableStrategy.address, CURVE_3POOL_ADDRESS, allocatedFund);
      const after = await usdcContract.balanceOf(curve3Pool.address);
      // fund is added to the pool
      expect(after.sub(before)).to.equal(allocatedFund);

      expect(await convexRewards.balanceOf(convexStableStrategy.address)).to.gt(ethers.constants.Zero);
      await jumpForward(60 * 60 * 24); // 1 day
      await convexStableStrategy.connect(governance).harvest();
      const estimatedTotal = ethers.utils.formatUnits(await convexStableStrategy.estimatedTotalAssets(), USDC_DECIMALS);
      // it's not going to make any profit as there is fee charged by Curve, so just check it is within certain range.
      expect(parseFloat(estimatedTotal)).to.be.closeTo(parseFloat(ethers.utils.formatUnits(allocatedFund, USDC_DECIMALS)), 1);
    });

    it("emergency withdraw", async () => {
      await vault.connect(user).deposit(depositAmount, user.address);
      //
      await convexStableStrategy.connect(governance).harvest();
      await convexStableStrategy.connect(governance).setEmergencyExit();
      const beforeBalance = await usdcContract.balanceOf(vault.address);
      await convexStableStrategy.connect(governance).harvest();
      const afterBalance = await usdcContract.balanceOf(vault.address);
      const diff = afterBalance.sub(beforeBalance);
      expect(parseFloat(ethers.utils.formatUnits(diff, USDC_DECIMALS))).to.be.closeTo(
        parseFloat(ethers.utils.formatUnits(allocatedFund, USDC_DECIMALS)),
        1
      );
    });
  });
});
