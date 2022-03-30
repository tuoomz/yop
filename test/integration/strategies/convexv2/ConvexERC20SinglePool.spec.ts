import { expect } from "chai";
import { setupVault, impersonate, setEthBalance, jumpForward, reset } from "../../shared/setup";
import { ethers } from "hardhat";
import { SingleAssetVault } from "../../../../types/SingleAssetVault";
import { VaultStrategyDataStore } from "../../../../types/VaultStrategyDataStore";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import ERC20ABI from "../../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import CurvePoolZapDepositor from "../../../abis/curvePoolZapDepositor.json";
import CurveBasePoolABI from "../../../abis/curvePlainPoolTrio.json";
import CurveStableSwapABI from "../../../abis/curvePlainPool.json";
import ConvexRewardsABI from "../../../abis/convexBaseRewards.json";
import { ICurveDeposit } from "../../../../types/ICurveDeposit";
import { ConvexERC20SinglePool, ERC20, IConvexRewards } from "../../../../types";

const WBTC_ADDRESS = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const CONVEX_BOOSTER_ADDRESS = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
// a zap depositor
const CURVE_OBTC_ZAP_POOL_ADDRESS = "0xd5BCf53e2C81e1991570f33Fa881c49EEa570C8D";
const CURVE_OBTC_BASE_POOL_ADDRESS = "0x7fc77b5c7614e1533320ea6ddc2eb61fa00a9714";
const CURVE_OBTAC_GAUGE_ADDRESS = "0x11137B10C210b579405c21A07489e28F3c040AB1";
const CONVEX_OBTC_POOL_ID = 20;

// a plain pool
const CURVE_RENBTC_POOL_ADDRESS = "0x93054188d876f558f4a66B2EF1d97d16eDf0895B";
const CURVE_RENBTC_GAUGE_ADDRESS = "0xB1F2cdeC61db658F091671F5f199635aEF202CAC";
const WBTC_WHALE_ADDRESS = "0xbf72da2bd84c5170618fbe5914b0eca9638d5eb5";
const WBTC_DECIMALS = 8;
const CONVEX_REN_BTC_POOL_ID = 6;

describe("ConvexERC20SinglePoolStrategy [@skip-on-coverage]", async () => {
  let vault: SingleAssetVault;
  let vaultStrategyDataStore: VaultStrategyDataStore;
  let governance: SignerWithAddress;
  let convexOBTCStrategy: ConvexERC20SinglePool;
  let convexRenBTCStrategy: ConvexERC20SinglePool;
  let proposer: SignerWithAddress;
  let developer: SignerWithAddress;
  let keeper: SignerWithAddress;
  let user: SignerWithAddress;
  let wbtcContract: ERC20;
  let curveBtcZapDepositor: ICurveDeposit;
  let curveBasePool: ICurveDeposit;
  let curveRenBTCPool: ICurveDeposit;
  beforeEach(async () => {
    await reset();
    // setup the vault
    ({ vault, vaultStrategyDataStore, governance } = await setupVault(WBTC_ADDRESS));
    // deploy the strategy
    [proposer, developer, keeper, user] = (await ethers.getSigners()).reverse();
    const strategyFactory = await ethers.getContractFactory("ConvexERC20SinglePool");
    convexOBTCStrategy = (await strategyFactory.deploy(
      vault.address,
      proposer.address,
      developer.address,
      keeper.address,
      CURVE_OBTC_ZAP_POOL_ADDRESS,
      CURVE_OBTAC_GAUGE_ADDRESS,
      4,
      2,
      WBTC_ADDRESS,
      true,
      CONVEX_OBTC_POOL_ID,
      CONVEX_BOOSTER_ADDRESS
    )) as ConvexERC20SinglePool;
    convexRenBTCStrategy = (await strategyFactory.deploy(
      vault.address,
      proposer.address,
      developer.address,
      keeper.address,
      CURVE_RENBTC_POOL_ADDRESS,
      CURVE_RENBTC_GAUGE_ADDRESS,
      2,
      1,
      WBTC_ADDRESS,
      false,
      CONVEX_REN_BTC_POOL_ID,
      CONVEX_BOOSTER_ADDRESS
    )) as ConvexERC20SinglePool;
    // add the strategy to the vault
    await vaultStrategyDataStore
      .connect(governance)
      .addStrategy(vault.address, convexOBTCStrategy.address, 4500, ethers.constants.Zero, ethers.constants.MaxUint256, 100);
    await vaultStrategyDataStore
      .connect(governance)
      .addStrategy(vault.address, convexRenBTCStrategy.address, 4500, ethers.constants.Zero, ethers.constants.MaxUint256, 100);
    await vault.connect(governance).unpause();

    // send some wbtc to the user
    wbtcContract = (await ethers.getContractAt(ERC20ABI, WBTC_ADDRESS)) as ERC20;
    await setEthBalance(WBTC_WHALE_ADDRESS, ethers.utils.parseEther("10"));
    await wbtcContract.connect(await impersonate(WBTC_WHALE_ADDRESS)).transfer(user.address, ethers.utils.parseUnits("10", WBTC_DECIMALS));
    await wbtcContract.connect(user).approve(vault.address, ethers.constants.MaxUint256);

    // get an instance of the pool contract
    curveBtcZapDepositor = (await ethers.getContractAt(CurvePoolZapDepositor, CURVE_OBTC_ZAP_POOL_ADDRESS)) as ICurveDeposit;
    curveBasePool = (await ethers.getContractAt(CurveBasePoolABI, CURVE_OBTC_BASE_POOL_ADDRESS)) as ICurveDeposit;
    curveRenBTCPool = (await ethers.getContractAt(CurveStableSwapABI, CURVE_RENBTC_POOL_ADDRESS)) as ICurveDeposit;
  });

  describe("oBTC pool happy path", async () => {
    const depositAmount = ethers.utils.parseUnits("10", WBTC_DECIMALS);
    const allocatedFund = ethers.utils.parseUnits("4.5", WBTC_DECIMALS); // 90% ratio

    it("normal operation", async () => {
      // deposit the funds and verify that the funds are transferred
      expect(await wbtcContract.balanceOf(user.address)).to.equal(depositAmount);
      expect(await vault.balanceOf(user.address)).to.equal(ethers.constants.Zero);
      await vault.connect(user).deposit(depositAmount, user.address);
      expect(await wbtcContract.balanceOf(user.address)).to.equal(ethers.constants.Zero);
      expect(await wbtcContract.balanceOf(vault.address)).to.equal(depositAmount);
      expect(await vault.balanceOf(user.address)).to.gt(ethers.constants.Zero);

      const convexRewardsAddress = await convexOBTCStrategy.cvxRewards();
      const convexRewards = (await ethers.getContractAt(ConvexRewardsABI, convexRewardsAddress)) as IConvexRewards;
      expect(await convexRewards.balanceOf(convexOBTCStrategy.address)).to.equal(ethers.constants.Zero);

      const before = await wbtcContract.balanceOf(curveBasePool.address);

      await expect(await convexOBTCStrategy.connect(governance).harvest())
        // allocated to the strategy
        .to.emit(wbtcContract, "Transfer")
        .withArgs(vault.address, convexOBTCStrategy.address, allocatedFund)
        // transferred to the zap depositor
        .to.emit(wbtcContract, "Transfer")
        .withArgs(convexOBTCStrategy.address, curveBtcZapDepositor.address, allocatedFund);
      // tried to use "to.emit" to check the transfer event from zap to the base pool, but it keeps failing.
      // however, checking the event logs and the balance and the events are reported. So might be a bug with the library itself.
      const after = await wbtcContract.balanceOf(curveBasePool.address);

      const cvxAfter = parseFloat(ethers.utils.formatEther(await convexRewards.balanceOf(convexOBTCStrategy.address)).substring(0, 6));
      expect(cvxAfter).to.be.closeTo(4.5, 0.3);
      // fund is added to the pool
      expect(after.sub(before)).to.equal(allocatedFund);
      await jumpForward(60 * 60 * 24); // 1 day
      await convexOBTCStrategy.connect(governance).harvest();
      const estimatedTotal = ethers.utils.formatUnits(await convexOBTCStrategy.estimatedTotalAssets(), WBTC_DECIMALS);
      // it's not going to make any profit as there is fee charged by Curve, so just check it is within certain range.
      expect(parseFloat(estimatedTotal)).to.be.closeTo(parseFloat(ethers.utils.formatUnits(allocatedFund, WBTC_DECIMALS)), 1);
    });

    it("emergency withdraw", async () => {
      await vault.connect(user).deposit(depositAmount, user.address);
      await expect(async () => await convexOBTCStrategy.connect(governance).harvest()).to.changeTokenBalance(
        wbtcContract,
        curveBasePool,
        allocatedFund
      );
      await convexOBTCStrategy.connect(governance).setEmergencyExit();
      const beforeBalance = await wbtcContract.balanceOf(vault.address);
      await convexOBTCStrategy.connect(governance).harvest();
      const afterBalance = await wbtcContract.balanceOf(vault.address);
      const diff = afterBalance.sub(beforeBalance);
      expect(parseFloat(ethers.utils.formatUnits(diff, WBTC_DECIMALS))).to.be.closeTo(
        parseFloat(ethers.utils.formatUnits(allocatedFund, WBTC_DECIMALS)),
        1
      );
    });
  });

  describe("renBTC pool happy path", async () => {
    const depositAmount = ethers.utils.parseUnits("10", WBTC_DECIMALS);
    const allocatedFund = ethers.utils.parseUnits("4.5", WBTC_DECIMALS); // 90% ratio

    it("normal operation", async () => {
      // deposit the funds and verify that the funds are transferred
      expect(await wbtcContract.balanceOf(user.address)).to.equal(depositAmount);
      expect(await vault.balanceOf(user.address)).to.equal(ethers.constants.Zero);
      await vault.connect(user).deposit(depositAmount, user.address);
      expect(await wbtcContract.balanceOf(user.address)).to.equal(ethers.constants.Zero);
      expect(await wbtcContract.balanceOf(vault.address)).to.equal(depositAmount);
      expect(await vault.balanceOf(user.address)).to.gt(ethers.constants.Zero);
      const before = await wbtcContract.balanceOf(curveRenBTCPool.address);

      const convexRewardsAddress = await convexRenBTCStrategy.cvxRewards();
      const convexRewards = (await ethers.getContractAt(ConvexRewardsABI, convexRewardsAddress)) as IConvexRewards;
      expect(await convexRewards.balanceOf(convexRenBTCStrategy.address)).to.equal(ethers.constants.Zero);

      await expect(await convexRenBTCStrategy.connect(governance).harvest())
        // allocated to the strategy
        .to.emit(wbtcContract, "Transfer")
        .withArgs(vault.address, convexRenBTCStrategy.address, allocatedFund)
        // transferred to the curve renBTC pool
        .to.emit(wbtcContract, "Transfer")
        .withArgs(convexRenBTCStrategy.address, curveRenBTCPool.address, allocatedFund);
      // tried to use "to.emit" to check the transfer event from zap to the base pool, but it keeps failing.
      // however, checking the event logs and the balance and the events are reported. So might be a bug with the library itself.
      const after = await wbtcContract.balanceOf(curveRenBTCPool.address);

      const cvxAfter = parseFloat(ethers.utils.formatEther(await convexRewards.balanceOf(convexRenBTCStrategy.address)).substring(0, 6));
      expect(cvxAfter).to.be.closeTo(4.5, 0.3);

      // fund is added to the pool
      expect(after.sub(before)).to.equal(allocatedFund);

      await jumpForward(60 * 60 * 24); // 1 day
      await convexRenBTCStrategy.connect(governance).harvest();
      const estimatedTotal = ethers.utils.formatUnits(await convexRenBTCStrategy.estimatedTotalAssets(), WBTC_DECIMALS);
      // it's not going to make any profit as there is fee charged by Curve, so just check it is within certain range.
      expect(parseFloat(estimatedTotal)).to.be.closeTo(parseFloat(ethers.utils.formatUnits(allocatedFund, WBTC_DECIMALS)), 1);
    });

    it("emergency withdraw", async () => {
      await vault.connect(user).deposit(depositAmount, user.address);
      await expect(async () => await convexRenBTCStrategy.connect(governance).harvest()).to.changeTokenBalance(
        wbtcContract,
        curveRenBTCPool,
        allocatedFund
      );
      await jumpForward(60 * 60 * 24); // 1 day
      await convexRenBTCStrategy.connect(governance).setEmergencyExit();
      const beforeBalance = await wbtcContract.balanceOf(vault.address);
      await convexRenBTCStrategy.connect(governance).harvest();
      const afterBalance = await wbtcContract.balanceOf(vault.address);
      const diff = afterBalance.sub(beforeBalance);
      expect(parseFloat(ethers.utils.formatUnits(diff, WBTC_DECIMALS))).to.be.closeTo(
        parseFloat(ethers.utils.formatUnits(allocatedFund, WBTC_DECIMALS)),
        1
      );
    });
  });
});
