import { expect } from "chai";
import { setupVault, impersonate, setEthBalance, jumpForward, reset } from "../shared/setup";
import { ethers, waffle } from "hardhat";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { VaultStrategyDataStore } from "../../../types/VaultStrategyDataStore";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ConvexEth } from "../../../types/ConvexEth";
import WethABI from "../../abis/weth.json";
import { IWETH, IConvexRewards, IConvexDeposit } from "../../../types";
import CurvePlainPoolABI from "../../abis/curvePlainPool.json";
import ConvexRewardsABI from "../../abis/convexBaseRewards.json";
import ConvexBoosterABI from "../../abis/convexBooster.json";
import { ICurveDeposit } from "../../../types/ICurveDeposit";
import { BigNumber } from "ethers";

const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const CURVE_STETH_POOL_ADDRESS = "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022";
const WETH_WHALE_ADDRESS = "0x2f0b23f53734252bda2277357e97e1517d6b042a";
const CONVEX_BOOSTER_ADDRESS = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const CONVEX_REWARD_CONTRACT_ADDRESS = "0x0A760466E1B4621579a82a39CB56Dda2F4E70f03";

describe("ConvexStEthStrategy [@skip-on-coverage]", async () => {
  let vault: SingleAssetVault;
  let vaultStrategyDataStore: VaultStrategyDataStore;
  let governance: SignerWithAddress;
  let convexEthStrategy: ConvexEth;
  let proposer: SignerWithAddress;
  let developer: SignerWithAddress;
  let keeper: SignerWithAddress;
  let user: SignerWithAddress;
  let wethContract: IWETH;
  let curveStEthPool: ICurveDeposit;
  let convexRewards: IConvexRewards;
  let convexBooster: IConvexDeposit;
  let depositAmount: BigNumber;
  let allocatedFund: BigNumber;

  beforeEach(async () => {
    await reset(13612911);
    // setup the vault
    ({ vault, vaultStrategyDataStore, governance } = await setupVault(WETH_ADDRESS));
    // deploy the strategy
    [proposer, developer, keeper, user] = (await ethers.getSigners()).reverse();
    const ConvexEthStrategyFactory = await ethers.getContractFactory("ConvexEth");
    convexEthStrategy = (await ConvexEthStrategyFactory.deploy(
      vault.address,
      proposer.address,
      developer.address,
      keeper.address,
      CURVE_STETH_POOL_ADDRESS,
      CONVEX_BOOSTER_ADDRESS
    )) as ConvexEth;
    // add the strategy to the vault
    await vaultStrategyDataStore
      .connect(governance)
      .addStrategy(vault.address, convexEthStrategy.address, 9000, ethers.constants.Zero, ethers.constants.MaxUint256, 100);
    await vault.connect(governance).unpause();

    // send some weth to the user
    depositAmount = ethers.utils.parseEther("100");
    allocatedFund = ethers.utils.parseEther("90"); // 90% ratio
    wethContract = (await ethers.getContractAt(WethABI, WETH_ADDRESS)) as IWETH;
    await setEthBalance(WETH_WHALE_ADDRESS, ethers.utils.parseEther("10"));
    await wethContract.connect(await impersonate(WETH_WHALE_ADDRESS)).transfer(user.address, depositAmount);
    await wethContract.connect(user).approve(vault.address, ethers.constants.MaxUint256);

    // get an instance of the pool contract
    curveStEthPool = (await ethers.getContractAt(CurvePlainPoolABI, CURVE_STETH_POOL_ADDRESS)) as ICurveDeposit;
    convexRewards = (await ethers.getContractAt(ConvexRewardsABI, CONVEX_REWARD_CONTRACT_ADDRESS)) as IConvexRewards;
    convexBooster = (await ethers.getContractAt(ConvexBoosterABI, CONVEX_BOOSTER_ADDRESS)) as IConvexDeposit;
  });

  describe("happy path", async () => {
    it("normal operation", async () => {
      // deposit the funds and verify that the funds are transferred
      expect(await wethContract.balanceOf(user.address)).to.equal(depositAmount);
      expect(await vault.balanceOf(user.address)).to.equal(ethers.constants.Zero);
      await vault.connect(user).deposit(depositAmount, user.address);
      expect(await wethContract.balanceOf(user.address)).to.equal(ethers.constants.Zero);
      expect(await wethContract.balanceOf(vault.address)).to.equal(depositAmount);
      expect(await vault.balanceOf(user.address)).to.gt(ethers.constants.Zero);
      expect(await convexRewards.balanceOf(convexEthStrategy.address)).to.equal(ethers.constants.Zero);
      await expect(await convexEthStrategy.connect(governance).harvest())
        // allocated to the strategy
        .to.emit(wethContract, "Transfer")
        .withArgs(vault.address, convexEthStrategy.address, allocatedFund)
        // converted to eth
        .to.emit(wethContract, "Withdrawal")
        .withArgs(convexEthStrategy.address, allocatedFund)
        // is deposited into the booster pool
        .to.emit(convexBooster, "Deposited")
        // fund is added to the pool
        .to.changeEtherBalance(curveStEthPool, allocatedFund);
      // the strategy should get some rewards tokens back from convex
      expect(await convexRewards.balanceOf(convexEthStrategy.address)).to.gt(ethers.constants.Zero);
      await jumpForward(60 * 60 * 24); // 1 day
      await convexEthStrategy.connect(governance).harvest();
      const estimatedTotal = ethers.utils.formatUnits(await convexEthStrategy.estimatedTotalAssets(), 18);
      // it's not going to make any profit as there is fee charged by Curve, so just check it is within certain range.
      expect(parseFloat(estimatedTotal)).to.be.closeTo(parseFloat(ethers.utils.formatUnits(allocatedFund, 18)), 1);
    });

    it("emergency withdraw", async () => {
      await vault.connect(user).deposit(depositAmount, user.address);
      await expect(await convexEthStrategy.connect(governance).harvest()).to.changeEtherBalance(curveStEthPool, allocatedFund);
      await convexEthStrategy.connect(governance).setEmergencyExit();
      const beforeBalance = await wethContract.balanceOf(vault.address);
      await convexEthStrategy.connect(governance).harvest();
      const afterBalance = await wethContract.balanceOf(vault.address);
      const diff = afterBalance.sub(beforeBalance);
      expect(parseFloat(ethers.utils.formatUnits(diff, 18))).to.be.closeTo(parseFloat(ethers.utils.formatUnits(allocatedFund, 18)), 1);
    });
  });
});
