import { expect } from "chai";
import { setupVault, impersonate, setEthBalance, jumpForward } from "../shared/setup";
import { ethers, waffle } from "hardhat";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { VaultStrategyDataStore } from "../../../types/VaultStrategyDataStore";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import ERC20ABI from "../../../abi/ERC20.json";
import CurvePoolZapDepositor from "../../abis/curvePoolZapDepositor.json";
import CurveBasePoolABI from "../../abis/curvePlainPoolTrio.json";
import { ICurveDeposit } from "../../../types/ICurveDeposit";
import { CurveBtc, ERC20 } from "../../../types";

const WBTC_ADDRESS = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const CURVE_OBTC_ZAP_POOL_ADDRESS = "0xd5BCf53e2C81e1991570f33Fa881c49EEa570C8D";
const CURVE_BTC_BASE_POOL_ADDRESS = "0x7fc77b5c7614e1533320ea6ddc2eb61fa00a9714";
const WBTC_WHALE_ADDRESS = "0xbf72da2bd84c5170618fbe5914b0eca9638d5eb5";
const WBTC_DECIMALS = 8;

describe("CurveBTCStrategy [@skip-on-coverage]", async () => {
  let vault: SingleAssetVault;
  let vaultStrategyDataStore: VaultStrategyDataStore;
  let governance: SignerWithAddress;
  let rewards: SignerWithAddress;
  let curveStrategy: CurveBtc;
  let strategist: SignerWithAddress;
  let keeper: SignerWithAddress;
  let user: SignerWithAddress;
  let wbtcContract: ERC20;
  let curveBtcZapDepositor: ICurveDeposit;
  let curveBasePool: ICurveDeposit;

  beforeEach(async () => {
    // setup the vault
    ({ vault, vaultStrategyDataStore, governance, rewards } = await setupVault(WBTC_ADDRESS));
    // deploy the strategy
    [strategist, keeper, user] = (await ethers.getSigners()).reverse();
    const strategyFactory = await ethers.getContractFactory("CurveBtc");
    curveStrategy = (await strategyFactory.deploy(
      vault.address,
      strategist.address,
      rewards.address,
      keeper.address,
      CURVE_OBTC_ZAP_POOL_ADDRESS
    )) as CurveBtc;
    // add the strategy to the vault
    await vaultStrategyDataStore
      .connect(governance)
      .addStrategy(vault.address, curveStrategy.address, 9000, ethers.constants.Zero, ethers.constants.MaxUint256, 100);
    await vault.connect(governance).unpause();

    // send some weth to the user
    wbtcContract = (await ethers.getContractAt(ERC20ABI, WBTC_ADDRESS)) as ERC20;
    await setEthBalance(WBTC_WHALE_ADDRESS, ethers.utils.parseEther("10"));
    await wbtcContract.connect(await impersonate(WBTC_WHALE_ADDRESS)).transfer(user.address, ethers.utils.parseUnits("10", WBTC_DECIMALS));
    await wbtcContract.connect(user).approve(vault.address, ethers.constants.MaxUint256);

    // get an instance of the pool contract
    curveBtcZapDepositor = (await ethers.getContractAt(CurvePoolZapDepositor, CURVE_OBTC_ZAP_POOL_ADDRESS)) as ICurveDeposit;
    curveBasePool = (await ethers.getContractAt(CurveBasePoolABI, CURVE_BTC_BASE_POOL_ADDRESS)) as ICurveDeposit;
  });

  describe("happy path", async () => {
    const depositAmount = ethers.utils.parseUnits("10", WBTC_DECIMALS);
    const allocatedFund = ethers.utils.parseUnits("9", WBTC_DECIMALS); // 90% ratio

    it("normal operation", async () => {
      // deposit the funds and verify that the funds are transferred
      expect(await wbtcContract.balanceOf(user.address)).to.equal(depositAmount);
      expect(await vault.balanceOf(user.address)).to.equal(ethers.constants.Zero);
      await vault.connect(user).deposit(depositAmount, user.address);
      expect(await wbtcContract.balanceOf(user.address)).to.equal(ethers.constants.Zero);
      expect(await wbtcContract.balanceOf(vault.address)).to.equal(depositAmount);
      expect(await vault.balanceOf(user.address)).to.gt(ethers.constants.Zero);
      const before = await wbtcContract.balanceOf(curveBasePool.address);
      await expect(await curveStrategy.connect(governance).harvest())
        // allocated to the strategy
        .to.emit(wbtcContract, "Transfer")
        .withArgs(vault.address, curveStrategy.address, allocatedFund)
        // transferred to the zap depositor
        .to.emit(wbtcContract, "Transfer")
        .withArgs(curveStrategy.address, curveBtcZapDepositor.address, allocatedFund);
      // tried to use "to.emit" to check the transfer event from zap to the base pool, but it keeps failing.
      // however, checking the event logs and the balance and the events are reported. So might be a bug with the library itself.
      const after = await wbtcContract.balanceOf(curveBasePool.address);
      // fund is added to the pool
      expect(after.sub(before)).to.equal(allocatedFund);

      await jumpForward(60 * 60 * 24); // 1 day
      await curveStrategy.connect(governance).harvest();
      const estimatedTotal = ethers.utils.formatUnits(await curveStrategy.estimatedTotalAssets(), WBTC_DECIMALS);
      // it's not going to make any profit as there is fee charged by Curve, so just check it is within certain range.
      expect(parseFloat(estimatedTotal)).to.be.closeTo(parseFloat(ethers.utils.formatUnits(allocatedFund, WBTC_DECIMALS)), 1);
    });

    it("emergency withdraw", async () => {
      await vault.connect(user).deposit(depositAmount, user.address);
      await expect(async () => await curveStrategy.connect(governance).harvest()).to.changeTokenBalance(
        wbtcContract,
        curveBasePool,
        allocatedFund
      );
      await curveStrategy.connect(governance).setEmergencyExit();
      const beforeBalance = await wbtcContract.balanceOf(vault.address);
      await curveStrategy.connect(governance).harvest();
      const afterBalance = await wbtcContract.balanceOf(vault.address);
      const diff = afterBalance.sub(beforeBalance);
      expect(parseFloat(ethers.utils.formatUnits(diff, WBTC_DECIMALS))).to.be.closeTo(
        parseFloat(ethers.utils.formatUnits(allocatedFund, WBTC_DECIMALS)),
        1
      );
    });
  });
});