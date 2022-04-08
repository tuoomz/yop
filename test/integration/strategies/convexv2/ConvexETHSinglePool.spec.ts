import { expect } from "chai";
import { setupVault, impersonate, setEthBalance, jumpForward, reset } from "../../shared/setup";
import { ethers, waffle } from "hardhat";
import { SingleAssetVault } from "../../../../types/SingleAssetVault";
import { VaultStrategyDataStore } from "../../../../types/VaultStrategyDataStore";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import WethABI from "../../../abis/weth.json";
import { IWETH, IConvexRewards } from "../../../../types";
import CurvePlainPoolABI from "../../../abis/curvePlainPool.json";
import { ICurveDeposit } from "../../../../types/ICurveDeposit";
import { ConvexETHSinglePool } from "../../../../types/ConvexETHSinglePool";
import ConvexRewardsABI from "../../../abis/convexBaseRewards.json";

const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const LDO_ADDRESS = "0x5a98fcbea516cf06857215779fd812ca3bef1b32";
const CONVEX_BOOSTER_ADDRESS = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
// curve stETH pool
const CURVE_STETH_POOL_ADDRESS = "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022";
const CURVE_STETH_GAUGE_ADDRESS = "0x182B723a58739a9c974cFDB385ceaDb237453c28";
const CONVEX_STETH_POOL_ID = 25;
// curve ankrETH pool
const CURVE_ANKRETH_POOL_ADDRESS = "0xA96A65c051bF88B4095Ee1f2451C2A9d43F53Ae2";
const CURVE_ANKRETH_GAUGE_ADDRESS = "0x6d10ed2cF043E6fcf51A0e7b4C2Af3Fa06695707";
const CONVEX_ANKRETH_POOL_ID = 27;
const WETH_WHALE_ADDRESS = "0x2f0b23f53734252bda2277357e97e1517d6b042a";

describe("ConvexETHSinglePoolStrategy [@skip-on-coverage]", async () => {
  let vault: SingleAssetVault;
  let vaultStrategyDataStore: VaultStrategyDataStore;
  let governance: SignerWithAddress;
  let convexStEthStrategy: ConvexETHSinglePool;
  let convexAnkrEthStrategy: ConvexETHSinglePool;
  let proposer: SignerWithAddress;
  let developer: SignerWithAddress;
  let keeper: SignerWithAddress;
  let user: SignerWithAddress;
  let wethContract: IWETH;
  let curveStEthPool: ICurveDeposit;
  let curveAnkrEthPool: ICurveDeposit;

  beforeEach(async () => {
    // await reset(13612911);
    await reset(14212231);
    // setup the vault
    ({ vault, vaultStrategyDataStore, governance } = await setupVault(WETH_ADDRESS));
    // deploy the strategy
    [proposer, developer, keeper, user] = (await ethers.getSigners()).reverse();
    const strategyFactory = await ethers.getContractFactory("ConvexETHSinglePool");
    convexStEthStrategy = (await strategyFactory.deploy(
      vault.address,
      proposer.address,
      developer.address,
      keeper.address,
      CURVE_STETH_POOL_ADDRESS,
      CURVE_STETH_GAUGE_ADDRESS,
      0,
      CONVEX_STETH_POOL_ID,
      CONVEX_BOOSTER_ADDRESS,
      LDO_ADDRESS
    )) as ConvexETHSinglePool;
    convexAnkrEthStrategy = (await strategyFactory.deploy(
      vault.address,
      proposer.address,
      developer.address,
      keeper.address,
      CURVE_ANKRETH_POOL_ADDRESS,
      CURVE_ANKRETH_GAUGE_ADDRESS,
      0,
      CONVEX_ANKRETH_POOL_ID,
      CONVEX_BOOSTER_ADDRESS,
      LDO_ADDRESS
    )) as ConvexETHSinglePool;
    // add the strategy to the vault
    await vaultStrategyDataStore
      .connect(governance)
      .addStrategy(vault.address, convexStEthStrategy.address, 4500, ethers.constants.Zero, ethers.constants.MaxUint256, 100);
    await vaultStrategyDataStore
      .connect(governance)
      .addStrategy(vault.address, convexAnkrEthStrategy.address, 4500, ethers.constants.Zero, ethers.constants.MaxUint256, 100);
    await vault.connect(governance).unpause();

    // send some weth to the user
    wethContract = (await ethers.getContractAt(WethABI, WETH_ADDRESS)) as IWETH;
    await setEthBalance(WETH_WHALE_ADDRESS, ethers.utils.parseEther("10"));
    await wethContract.connect(await impersonate(WETH_WHALE_ADDRESS)).transfer(user.address, ethers.utils.parseEther("100"));
    await wethContract.connect(user).approve(vault.address, ethers.constants.MaxUint256);

    // get an instance of the pool contract
    curveStEthPool = (await ethers.getContractAt(CurvePlainPoolABI, CURVE_STETH_POOL_ADDRESS)) as ICurveDeposit;
    curveAnkrEthPool = (await ethers.getContractAt(CurvePlainPoolABI, CURVE_ANKRETH_POOL_ADDRESS)) as ICurveDeposit;
  });

  describe("Convex stETH happy path", async () => {
    const depositAmount = ethers.utils.parseEther("100");
    const allocatedFund = ethers.utils.parseEther("45"); // 90% ratio

    it("normal operation", async () => {
      // deposit the funds and verify that the funds are transferred
      expect(await wethContract.balanceOf(user.address)).to.equal(depositAmount);
      expect(await vault.balanceOf(user.address)).to.equal(ethers.constants.Zero);
      await vault.connect(user).deposit(depositAmount, user.address);
      expect(await wethContract.balanceOf(user.address)).to.equal(ethers.constants.Zero);
      expect(await wethContract.balanceOf(vault.address)).to.equal(depositAmount);
      expect(await vault.balanceOf(user.address)).to.gt(ethers.constants.Zero);

      const convexStEthRewardsAddress = await convexStEthStrategy.cvxRewards();
      const convexStEthRewards = (await ethers.getContractAt(ConvexRewardsABI, convexStEthRewardsAddress)) as IConvexRewards;
      expect(await convexStEthRewards.balanceOf(convexStEthStrategy.address)).to.equal(ethers.constants.Zero);

      await expect(await convexStEthStrategy.connect(governance).harvest())
        // allocated to the strategy
        .to.emit(wethContract, "Transfer")
        .withArgs(vault.address, convexStEthStrategy.address, allocatedFund)
        // converted to eth
        .to.emit(wethContract, "Withdrawal")
        .withArgs(convexStEthStrategy.address, allocatedFund)
        // fund is added to the pool
        .to.changeEtherBalance(curveStEthPool, allocatedFund);

      const cvxAfter = parseFloat(ethers.utils.formatEther(await convexStEthRewards.balanceOf(convexStEthStrategy.address)).substring(0, 6));
      expect(cvxAfter).to.be.closeTo(45, 2);
      await jumpForward(60 * 60 * 24); // 1 day
      await convexStEthStrategy.connect(governance).harvest();
      const estimatedTotal = ethers.utils.formatUnits(await convexStEthStrategy.estimatedTotalAssets(), 18);
      // it's not going to make any profit as there is fee charged by Curve, so just check it is within certain range.
      expect(parseFloat(estimatedTotal)).to.be.closeTo(parseFloat(ethers.utils.formatUnits(allocatedFund, 18)), 1);
    });

    it("emergency withdraw", async () => {
      await vault.connect(user).deposit(depositAmount, user.address);
      await expect(await convexStEthStrategy.connect(governance).harvest()).to.changeEtherBalance(curveStEthPool, allocatedFund);
      await convexStEthStrategy.connect(governance).setEmergencyExit();
      const beforeBalance = await wethContract.balanceOf(vault.address);
      await convexStEthStrategy.connect(governance).harvest();
      const afterBalance = await wethContract.balanceOf(vault.address);
      const diff = afterBalance.sub(beforeBalance);
      expect(parseFloat(ethers.utils.formatUnits(diff, 18))).to.be.closeTo(parseFloat(ethers.utils.formatUnits(allocatedFund, 18)), 1);
    });
  });

  describe("Convex ankrETH happy path", async () => {
    const depositAmount = ethers.utils.parseEther("100");
    const allocatedFund = ethers.utils.parseEther("45"); // 90% ratio

    it("normal operation", async () => {
      // deposit the funds and verify that the funds are transferred
      expect(await wethContract.balanceOf(user.address)).to.equal(depositAmount);
      expect(await vault.balanceOf(user.address)).to.equal(ethers.constants.Zero);
      await vault.connect(user).deposit(depositAmount, user.address);
      expect(await wethContract.balanceOf(user.address)).to.equal(ethers.constants.Zero);
      expect(await wethContract.balanceOf(vault.address)).to.equal(depositAmount);
      expect(await vault.balanceOf(user.address)).to.gt(ethers.constants.Zero);
      await expect(await convexAnkrEthStrategy.connect(governance).harvest())
        // allocated to the strategy
        .to.emit(wethContract, "Transfer")
        .withArgs(vault.address, convexAnkrEthStrategy.address, allocatedFund)
        // converted to eth
        .to.emit(wethContract, "Withdrawal")
        .withArgs(convexAnkrEthStrategy.address, allocatedFund)
        // fund is added to the pool
        .to.changeEtherBalance(curveAnkrEthPool, allocatedFund);

      await jumpForward(60 * 60 * 24); // 1 day
      await convexAnkrEthStrategy.connect(governance).harvest();
      const estimatedTotal = ethers.utils.formatUnits(await convexAnkrEthStrategy.estimatedTotalAssets(), 18);
      // it's not going to make any profit as there is fee charged by Curve, so just check it is within certain range.
      expect(parseFloat(estimatedTotal)).to.be.closeTo(parseFloat(ethers.utils.formatUnits(allocatedFund, 18)), 1);
    });

    it("emergency withdraw", async () => {
      await vault.connect(user).deposit(depositAmount, user.address);
      await expect(await convexAnkrEthStrategy.connect(governance).harvest()).to.changeEtherBalance(curveAnkrEthPool, allocatedFund);
      await convexAnkrEthStrategy.connect(governance).setEmergencyExit();
      const beforeBalance = await wethContract.balanceOf(vault.address);
      await convexAnkrEthStrategy.connect(governance).harvest();
      const afterBalance = await wethContract.balanceOf(vault.address);
      const diff = afterBalance.sub(beforeBalance);
      expect(parseFloat(ethers.utils.formatUnits(diff, 18))).to.be.closeTo(parseFloat(ethers.utils.formatUnits(allocatedFund, 18)), 1);
    });
  });
});
