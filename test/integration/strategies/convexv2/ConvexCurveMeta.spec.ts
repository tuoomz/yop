import { expect } from "chai";
import { setupVault, impersonate, setEthBalance, jumpForward, reset } from "../../shared/setup";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";

import { SingleAssetVault } from "../../../../types/SingleAssetVault";
import { VaultStrategyDataStore } from "../../../../types/VaultStrategyDataStore";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import ERC20ABI from "../../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import CurveBasePoolABI from "../../../abis/curvePlainPoolTrio.json";
import { ICurveDeposit } from "../../../../types/ICurveDeposit";
import { ConvexCurveMeta, ERC20 } from "../../../../types";
import { CONST, Pool, Token } from "../../../constants";
import { MockContract } from "ethereum-waffle";

interface ConvexStrategy {
  name: string;
  basePool: Pool;
  indexOfWantInBasePool: number;
  metaPool: Pool;
  wantToken: Token;
  convexPoolId: number;
}
const strategies: ConvexStrategy[] = [
  {
    name: "Convex3poolUSDN",
    basePool: CONST.THREE_POOL,
    metaPool: CONST.USDN_META_POOL,
    wantToken: CONST.TOKENS.USDC,
    indexOfWantInBasePool: CONST.THREE_POOL.COINS.USDC,
    convexPoolId: 13,
  },
  {
    name: "ConvexsBTCtBTC",
    basePool: CONST.SBTC,
    metaPool: CONST.TBTC_META_POOL,
    wantToken: CONST.TOKENS.WBTC,
    indexOfWantInBasePool: CONST.SBTC.COINS.WBTC,
    convexPoolId: 16,
  },
];

strategies.forEach(function (strategy) {
  describe("Test for strategy: " + strategy.name + " [@skip-on-coverage]", async () => {
    let vault: SingleAssetVault;
    let vaultStrategyDataStore: VaultStrategyDataStore;
    let governance: SignerWithAddress;
    let convexCurveStrategy: ConvexCurveMeta;
    let proposer: SignerWithAddress;
    let developer: SignerWithAddress;
    let keeper: SignerWithAddress;
    let user: SignerWithAddress;
    let wantContract: ERC20;
    let curveBasePool: ICurveDeposit;
    let curveMetaPool: ICurveDeposit;
    let depositAmount: BigNumber;
    let allocatedFund: BigNumber;

    beforeEach(async () => {
      await reset();
      // setup the vault
      ({ vault, vaultStrategyDataStore, governance } = await setupVault(strategy.wantToken.ADDRESS));

      // deploy the strategy
      [proposer, developer, keeper, user] = (await ethers.getSigners()).reverse();
      const convexCurveMetaFactory = await ethers.getContractFactory("ConvexCurveMeta");
      convexCurveStrategy = (await convexCurveMetaFactory.deploy(
        vault.address,
        proposer.address,
        developer.address,
        keeper.address,
        strategy.basePool.ADDRESS,
        strategy.basePool.LP_TOKEN,
        strategy.metaPool.ADDRESS,
        strategy.metaPool.LP_TOKEN,
        strategy.indexOfWantInBasePool,
        strategy.basePool.NO_OF_COINS,
        CONST.CONVEX_BOOSTER_ADDRESS,
        strategy.convexPoolId
      )) as ConvexCurveMeta;
      // add the strategy to the vault
      await vaultStrategyDataStore
        .connect(governance)
        .addStrategy(vault.address, convexCurveStrategy.address, 9000, ethers.constants.Zero, ethers.constants.MaxUint256, 100);
      await vault.connect(governance).unpause();

      // send some weth to the user
      wantContract = (await ethers.getContractAt(ERC20ABI, strategy.wantToken.ADDRESS)) as ERC20;
      await setEthBalance(strategy.wantToken.WHALE, ethers.utils.parseEther("10"));
      await wantContract.connect(user).approve(vault.address, ethers.constants.MaxUint256);
      depositAmount = ethers.utils.parseUnits("1000", strategy.wantToken.DECIMALS);
      allocatedFund = ethers.utils.parseUnits("900", strategy.wantToken.DECIMALS); // 90% ratio
      await wantContract.connect(await impersonate(strategy.wantToken.WHALE)).transfer(user.address, depositAmount);
      // get an instance of the pool contract
      curveBasePool = (await ethers.getContractAt(CurveBasePoolABI, strategy.basePool.ADDRESS)) as ICurveDeposit;
      curveMetaPool = (await ethers.getContractAt(CurveBasePoolABI, strategy.metaPool.ADDRESS)) as ICurveDeposit;
    });

    describe("Happy path", async () => {
      it("normal operation", async () => {
        // deposit the funds and verify that the funds are transferred
        expect(await wantContract.balanceOf(user.address)).to.equal(depositAmount);
        expect(await vault.balanceOf(user.address)).to.equal(ethers.constants.Zero);
        await vault.connect(user).deposit(depositAmount, user.address);
        expect(await wantContract.balanceOf(user.address)).to.equal(ethers.constants.Zero);
        expect(await wantContract.balanceOf(vault.address)).to.equal(depositAmount);
        expect(await vault.balanceOf(user.address)).to.gt(ethers.constants.Zero);
        const before = await wantContract.balanceOf(curveBasePool.address);
        await expect(await convexCurveStrategy.connect(governance).harvest())
          // allocated to the strategy
          .to.emit(wantContract, "Transfer")
          .withArgs(vault.address, convexCurveStrategy.address, allocatedFund)
          // transferred to the zap depositor
          .to.emit(wantContract, "Transfer")
          .withArgs(convexCurveStrategy.address, curveBasePool.address, allocatedFund);
        // tried to use "to.emit" to check the transfer event from zap to the base pool, but it keeps failing.
        // however, checking the event logs and the balance and the events are reported. So might be a bug with the library itself.
        const after = await wantContract.balanceOf(curveBasePool.address);
        // fund is added to the pool
        expect(after.sub(before)).to.equal(allocatedFund);

        await jumpForward(60 * 60 * 24); // 1 day
        await convexCurveStrategy.connect(governance).harvest();
        const estimatedTotal = ethers.utils.formatUnits(await convexCurveStrategy.estimatedTotalAssets(), strategy.wantToken.DECIMALS);
        // it's not going to make any profit as there is fee charged by Curve, so just check it is within certain range.
        expect(parseFloat(estimatedTotal)).to.be.closeTo(parseFloat(ethers.utils.formatUnits(allocatedFund, strategy.wantToken.DECIMALS)), 1);
      });

      it("emergency withdraw", async () => {
        await vault.connect(user).deposit(depositAmount, user.address);
        await expect(async () => await convexCurveStrategy.connect(governance).harvest()).to.changeTokenBalance(
          wantContract,
          curveBasePool,
          allocatedFund
        );
        await convexCurveStrategy.connect(governance).setEmergencyExit();
        const beforeBalance = await wantContract.balanceOf(vault.address);
        await convexCurveStrategy.connect(governance).harvest();
        const afterBalance = await wantContract.balanceOf(vault.address);
        const diff = afterBalance.sub(beforeBalance);
        expect(parseFloat(ethers.utils.formatUnits(diff, strategy.wantToken.DECIMALS))).to.be.closeTo(
          parseFloat(ethers.utils.formatUnits(allocatedFund, strategy.wantToken.DECIMALS)),
          1
        );
      });
    });
  });
});
