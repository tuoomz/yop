import { expect } from "chai";
import { setupVault, impersonate, setEthBalance, jumpForward, setupWBTCVault, reset } from "../shared/setup";
import { ethers, waffle, network } from "hardhat";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { VaultStrategyDataStore } from "../../../types/VaultStrategyDataStore";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import ERC20ABI from "../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import CurvePoolZapDepositor from "../../abis/curvePoolZapDepositor.json";
import CurveBasePoolABI from "../../abis/curvePlainPoolTrio.json";
import ConvexRewardsABI from "../../abis/convexBaseRewards.json";
import ConvexBoosterABI from "../../abis/convexBooster.json";
import { ICurveDeposit } from "../../../types/ICurveDeposit";
import { ConvexBtc, ERC20 } from "../../../types";
import { IConvexDeposit } from "../../../types/IConvexDeposit";
import { IConvexRewards } from "../../../types/IConvexRewards";
import { BigNumber } from "ethers";

const WBTC_ADDRESS = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const CURVE_OBTC_ZAP_POOL_ADDRESS = "0xd5BCf53e2C81e1991570f33Fa881c49EEa570C8D";
const CURVE_BTC_BASE_POOL_ADDRESS = "0x7fc77b5c7614e1533320ea6ddc2eb61fa00a9714";
const WBTC_WHALE_ADDRESS = "0xbf72da2bd84c5170618fbe5914b0eca9638d5eb5";
const CONVEX_BOOSTER_ADDRESS = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const CONVEX_REWARD_CONTRACT_ADDRESS = "0xeeeCE77e0bc5e59c77fc408789A9A172A504bD2f";
const WBTC_DECIMALS = 8;

describe("ConvexBTCStrategy [@skip-on-coverage]", async () => {
  let vault: SingleAssetVault;
  let vaultStrategyDataStore: VaultStrategyDataStore;
  let governance: SignerWithAddress;
  let convexStrategy: ConvexBtc;
  let proposer: SignerWithAddress;
  let developer: SignerWithAddress;
  let keeper: SignerWithAddress;
  let user: SignerWithAddress;
  let wbtcContract: ERC20;
  let curveBtcZapDepositor: ICurveDeposit;
  let curveBasePool: ICurveDeposit;
  let convexBooster: IConvexDeposit;
  let convexRewards: IConvexRewards;
  let depositAmount: BigNumber;
  let allocatedFund: BigNumber;
  let startTime: number;

  beforeEach(async () => {
    await reset(13612911);
    // setup the vault
    ({ vault, vaultStrategyDataStore, governance } = await setupWBTCVault());
    // deploy the strategy
    [proposer, developer, keeper, user] = (await ethers.getSigners()).reverse();
    const strategyFactory = await ethers.getContractFactory("ConvexBtc");
    convexStrategy = (await strategyFactory.deploy(
      vault.address,
      proposer.address,
      developer.address,
      keeper.address,
      CURVE_OBTC_ZAP_POOL_ADDRESS,
      CONVEX_BOOSTER_ADDRESS
    )) as ConvexBtc;
    // add the strategy to the vault
    await vaultStrategyDataStore
      .connect(governance)
      .addStrategy(vault.address, convexStrategy.address, 9000, ethers.constants.Zero, ethers.constants.MaxUint256, 100);
    await vault.connect(governance).unpause();

    // send some weth to the user
    depositAmount = ethers.utils.parseUnits("10", WBTC_DECIMALS);
    allocatedFund = ethers.utils.parseUnits("9", WBTC_DECIMALS); // 90% ratio
    wbtcContract = (await ethers.getContractAt(ERC20ABI, WBTC_ADDRESS)) as ERC20;
    await setEthBalance(WBTC_WHALE_ADDRESS, ethers.utils.parseEther("10"));
    await wbtcContract.connect(await impersonate(WBTC_WHALE_ADDRESS)).transfer(user.address, depositAmount);
    await wbtcContract.connect(user).approve(vault.address, ethers.constants.MaxUint256);

    // get an instance of the pool contract
    curveBtcZapDepositor = (await ethers.getContractAt(CurvePoolZapDepositor, CURVE_OBTC_ZAP_POOL_ADDRESS)) as ICurveDeposit;
    curveBasePool = (await ethers.getContractAt(CurveBasePoolABI, CURVE_BTC_BASE_POOL_ADDRESS)) as ICurveDeposit;
    convexRewards = (await ethers.getContractAt(ConvexRewardsABI, CONVEX_REWARD_CONTRACT_ADDRESS)) as IConvexRewards;
    convexBooster = (await ethers.getContractAt(ConvexBoosterABI, CONVEX_BOOSTER_ADDRESS)) as IConvexDeposit;
  });

  describe("happy path", async () => {
    it("normal operation", async () => {
      // deposit the funds and verify that the funds are transferred
      expect(await wbtcContract.balanceOf(user.address)).to.equal(depositAmount);
      expect(await vault.balanceOf(user.address)).to.equal(ethers.constants.Zero);
      await vault.connect(user).deposit(depositAmount, user.address);
      expect(await wbtcContract.balanceOf(user.address)).to.equal(ethers.constants.Zero);
      expect(await wbtcContract.balanceOf(vault.address)).to.equal(depositAmount);
      expect(await vault.balanceOf(user.address)).to.gt(ethers.constants.Zero);
      const before = await wbtcContract.balanceOf(curveBasePool.address);
      expect(await convexRewards.balanceOf(convexStrategy.address)).to.equal(ethers.constants.Zero);
      await expect(await convexStrategy.connect(governance).harvest())
        // allocated to the strategy
        .to.emit(wbtcContract, "Transfer")
        .withArgs(vault.address, convexStrategy.address, allocatedFund)
        // transferred to the zap depositor
        .to.emit(wbtcContract, "Transfer")
        .withArgs(convexStrategy.address, curveBtcZapDepositor.address, allocatedFund)
        .to.emit(convexBooster, "Deposited");
      // tried to use "to.emit" to check the transfer event from zap to the base pool, but it keeps failing.
      // however, checking the event logs and the balance and the events are reported. So might be a bug with the library itself.
      const after = await wbtcContract.balanceOf(curveBasePool.address);
      // fund is added to the pool
      expect(after.sub(before)).to.equal(allocatedFund);
      expect(await convexRewards.balanceOf(convexStrategy.address)).to.gt(ethers.constants.Zero);
      await jumpForward(60 * 60 * 24); // 1 day
      await convexStrategy.connect(governance).harvest();
      const estimatedTotal = ethers.utils.formatUnits(await convexStrategy.estimatedTotalAssets(), WBTC_DECIMALS);
      // it's not going to make any profit as there is fee charged by Curve, so just check it is within certain range.
      expect(parseFloat(estimatedTotal)).to.be.closeTo(parseFloat(ethers.utils.formatUnits(allocatedFund, WBTC_DECIMALS)), 1);
    });

    it("emergency withdraw", async () => {
      await vault.connect(user).deposit(depositAmount, user.address);
      await expect(async () => await convexStrategy.connect(governance).harvest()).to.changeTokenBalance(
        wbtcContract,
        curveBasePool,
        allocatedFund
      );
      await convexStrategy.connect(governance).setEmergencyExit();
      const beforeBalance = await wbtcContract.balanceOf(vault.address);
      await convexStrategy.connect(governance).harvest();
      const afterBalance = await wbtcContract.balanceOf(vault.address);
      const diff = afterBalance.sub(beforeBalance);
      expect(parseFloat(ethers.utils.formatUnits(diff, WBTC_DECIMALS))).to.be.closeTo(
        parseFloat(ethers.utils.formatUnits(allocatedFund, WBTC_DECIMALS)),
        1
      );
    });
  });
});
