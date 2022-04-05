import { expect } from "chai";
import { setupVault, impersonate, setEthBalance, jumpForward, reset } from "../shared/setup";
import { ethers, waffle } from "hardhat";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { VaultStrategyDataStore } from "../../../types/VaultStrategyDataStore";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { CurveEth } from "../../../types/CurveEth";
import WethABI from "../../abis/weth.json";
import { IWETH } from "../../../types";
import CurvePlainPoolABI from "../../abis/curvePlainPool.json";
import { ICurveDeposit } from "../../../types/ICurveDeposit";

const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const CURVE_STETH_POOL_ADDRESS = "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022";
const WETH_WHALE_ADDRESS = "0x2f0b23f53734252bda2277357e97e1517d6b042a";

describe("CurveStEthStrategy [@skip-on-coverage]", async () => {
  let vault: SingleAssetVault;
  let vaultStrategyDataStore: VaultStrategyDataStore;
  let governance: SignerWithAddress;
  let curveEthStrategy: CurveEth;
  let proposer: SignerWithAddress;
  let developer: SignerWithAddress;
  let keeper: SignerWithAddress;
  let user: SignerWithAddress;
  let wethContract: IWETH;
  let curveStEthPool: ICurveDeposit;

  beforeEach(async () => {
    await reset(13612911);
    // setup the vault
    ({ vault, vaultStrategyDataStore, governance } = await setupVault(WETH_ADDRESS));
    // deploy the strategy
    [proposer, developer, keeper, user] = (await ethers.getSigners()).reverse();
    const CurveEthStrategyFactory = await ethers.getContractFactory("CurveEth");
    curveEthStrategy = (await CurveEthStrategyFactory.deploy(
      vault.address,
      proposer.address,
      developer.address,
      keeper.address,
      CURVE_STETH_POOL_ADDRESS
    )) as CurveEth;
    // add the strategy to the vault
    await vaultStrategyDataStore
      .connect(governance)
      .addStrategy(vault.address, curveEthStrategy.address, 9000, ethers.constants.Zero, ethers.constants.MaxUint256, 100);
    await vault.connect(governance).unpause();

    // send some weth to the user
    wethContract = (await ethers.getContractAt(WethABI, WETH_ADDRESS)) as IWETH;
    await setEthBalance(WETH_WHALE_ADDRESS, ethers.utils.parseEther("10"));
    await wethContract.connect(await impersonate(WETH_WHALE_ADDRESS)).transfer(user.address, ethers.utils.parseEther("100"));
    await wethContract.connect(user).approve(vault.address, ethers.constants.MaxUint256);

    // get an instance of the pool contract
    curveStEthPool = (await ethers.getContractAt(CurvePlainPoolABI, CURVE_STETH_POOL_ADDRESS)) as ICurveDeposit;
  });

  describe("happy path", async () => {
    const depositAmount = ethers.utils.parseEther("100");
    const allocatedFund = ethers.utils.parseEther("90"); // 90% ratio

    it("normal operation", async () => {
      // deposit the funds and verify that the funds are transferred
      expect(await wethContract.balanceOf(user.address)).to.equal(depositAmount);
      expect(await vault.balanceOf(user.address)).to.equal(ethers.constants.Zero);
      await vault.connect(user).deposit(depositAmount, user.address);
      expect(await wethContract.balanceOf(user.address)).to.equal(ethers.constants.Zero);
      expect(await wethContract.balanceOf(vault.address)).to.equal(depositAmount);
      expect(await vault.balanceOf(user.address)).to.gt(ethers.constants.Zero);
      await expect(await curveEthStrategy.connect(governance).harvest())
        // allocated to the strategy
        .to.emit(wethContract, "Transfer")
        .withArgs(vault.address, curveEthStrategy.address, allocatedFund)
        // converted to eth
        .to.emit(wethContract, "Withdrawal")
        .withArgs(curveEthStrategy.address, allocatedFund)
        // fund is added to the pool
        .to.changeEtherBalance(curveStEthPool, allocatedFund);

      await jumpForward(60 * 60 * 24); // 1 day
      await curveEthStrategy.connect(governance).harvest();
      const estimatedTotal = ethers.utils.formatUnits(await curveEthStrategy.estimatedTotalAssets(), 18);
      // it's not going to make any profit as there is fee charged by Curve, so just check it is within certain range.
      expect(parseFloat(estimatedTotal)).to.be.closeTo(parseFloat(ethers.utils.formatUnits(allocatedFund, 18)), 1);
    });

    it("emergency withdraw", async () => {
      await vault.connect(user).deposit(depositAmount, user.address);
      await expect(await curveEthStrategy.connect(governance).harvest()).to.changeEtherBalance(curveStEthPool, allocatedFund);
      await curveEthStrategy.connect(governance).setEmergencyExit();
      const beforeBalance = await wethContract.balanceOf(vault.address);
      await curveEthStrategy.connect(governance).harvest();
      const afterBalance = await wethContract.balanceOf(vault.address);
      const diff = afterBalance.sub(beforeBalance);
      expect(parseFloat(ethers.utils.formatUnits(diff, 18))).to.be.closeTo(parseFloat(ethers.utils.formatUnits(allocatedFund, 18)), 1);
    });
  });
});
