import chai, { expect } from "chai";
import { ethers, waffle } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { SingleAssetVault, VaultStrategyDataStore } from "../../../types";
// import { curveStableUsdcStrategyMock } from "../../../types/curveStableUsdcStrategyMock";
import { CurveStableStrategyMock } from "../../../types/CurveStableStrategyMock";
import { TokenMock } from "../../../types/TokenMock";
import { MockContract, solidity } from "ethereum-waffle";

import { setupVaultAndCurveTrio } from "../fixtures/setup";

import { near } from "../utils/near";
const { loadFixture } = waffle;

chai.use(solidity);
chai.use(near);
const { deployMockContract } = waffle;

describe("CurveStable strategy", async () => {
  let vault: SingleAssetVault;
  let vaultStrategyDataStore: VaultStrategyDataStore;
  let vaultToken: TokenMock;

  let governance: SignerWithAddress;
  let strategist: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let rewards: SignerWithAddress;
  let manager: SignerWithAddress;

  let poolLpToken: TokenMock; // 3crv
  let mockMetaPoolLpToken: TokenMock; // usdn3crv
  let curveToken: TokenMock;

  let mockDai: MockContract;
  let mockUsdc: MockContract;
  let mockUsdt: MockContract;

  let mockCurvePool: MockContract;
  let mockCurveMetaPool: MockContract;
  let mockCurveGauge: MockContract;
  let mockCurveMinter: MockContract;
  let mockCurveAddressProvider: MockContract;
  let mockDex: MockContract;

  let curveStableUsdcStrategy: CurveStableStrategyMock;

  beforeEach(async () => {
    const accounts = await ethers.getSigners();
    strategist = accounts[accounts.length - 1]; // go from the last to avoid conflicts with accounts returned from setupVault
    ({
      vault,
      vaultToken,
      vaultStrategyDataStore,
      governance,
      gatekeeper,
      manager,
      rewards,
      mockCurveAddressProvider,
      mockCurveMinter,
      mockCurvePool,
      mockCurveMetaPool,
      mockCurveGauge,
      mockDex,
      poolLpToken,
      mockMetaPoolLpToken,
      curveToken,
      mockDai,
      mockUsdc,
      mockUsdt,
    } = await loadFixture(setupVaultAndCurveTrio));

    await mockCurvePool.mock.coins.withArgs(0).returns(vaultToken.address);
    await mockCurvePool.mock.coins.withArgs(1).returns(mockUsdc.address);
    await mockCurvePool.mock.coins.withArgs(2).returns(mockUsdt.address);

    const curveStableUsdcStrategyFactory = await ethers.getContractFactory("CurveStableStrategyMock");
    curveStableUsdcStrategy = (await curveStableUsdcStrategyFactory.deploy(
      vault.address,
      strategist.address,
      rewards.address,
      gatekeeper.address,
      mockCurvePool.address,
      3
    )) as CurveStableStrategyMock;
    await curveStableUsdcStrategy.deployed();
    await curveStableUsdcStrategy.setTriPoolLpToken(poolLpToken.address);
    await curveStableUsdcStrategy.setMetaPoolLpToken(mockMetaPoolLpToken.address);
    await curveStableUsdcStrategy.setCurveAddressProvider(mockCurveAddressProvider.address);
    await curveStableUsdcStrategy.setCurveMinter(mockCurveMinter.address);
    await curveStableUsdcStrategy.setCurvePool(mockCurvePool.address);
    await curveStableUsdcStrategy.setMetaPool(mockCurveMetaPool.address);
    await curveStableUsdcStrategy.initCurveGauge();
    await curveStableUsdcStrategy.setDex(mockDex.address);
    await curveStableUsdcStrategy.setCurveTokenAddress(curveToken.address);
    await curveStableUsdcStrategy.connect(governance).approveAll();
  });

  describe("estimatedTotalAssets", async () => {
    const tokenAmount = ethers.utils.parseEther("100");
    const crvAmount = ethers.utils.parseEther("20");
    const exchangeAmountOut = ethers.utils.parseEther("10");
    const gaugeBalance = ethers.utils.parseEther("5");
    const withdrawAmountOut = ethers.utils.parseEther("5");

    beforeEach(async () => {
      vaultToken.mint(curveStableUsdcStrategy.address, tokenAmount);
      await mockCurveMinter.mock.minted.returns(ethers.constants.Zero);
      await mockDex.mock.getAmountsOut.returns([0, 0, exchangeAmountOut]);
      await mockCurveGauge.mock.integrate_fraction.returns(crvAmount);
      await mockCurveGauge.mock.balanceOf.returns(gaugeBalance);
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurveMetaPool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
    });

    it("should return the correct asset value", async () => {
      const expectedTotal = tokenAmount.add(exchangeAmountOut).add(withdrawAmountOut);
      const got = await curveStableUsdcStrategy.estimatedTotalAssets();
      expect(expectedTotal).to.equal(got);
    });
  });

  describe("_withdrawSome", async () => {
    const tokenAmount = ethers.utils.parseEther("10");
    const crvAmount = ethers.utils.parseEther("20");
    const exchangeAmountOut = ethers.utils.parseEther("10");
    const gaugeBalance = ethers.utils.parseEther("5");
    const withdrawAmountOut = ethers.utils.parseEther("5");
    const metaLpBalance = ethers.utils.parseEther("2");

    beforeEach(async () => {
      vaultToken.mint(curveStableUsdcStrategy.address, tokenAmount);
      mockMetaPoolLpToken.mint(curveStableUsdcStrategy.address, metaLpBalance);
      poolLpToken.mint(curveStableUsdcStrategy.address, metaLpBalance);

      await mockCurveMinter.mock.minted.returns(ethers.constants.Zero);
      await mockDex.mock.getAmountsOut.returns([0, 0, exchangeAmountOut]);
      await mockCurveGauge.mock.balanceOf.returns(gaugeBalance);
      await mockCurveGauge.mock.integrate_fraction.returns(crvAmount);
      await mockCurveGauge.mock.withdraw.returns();
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurvePool.mock.remove_liquidity_one_coin.returns();
      await mockCurvePool.mock.calc_token_amount.returns(0);
      await mockCurveMetaPool.mock.remove_liquidity_one_coin.returns(0);
      await mockCurveMetaPool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurveMetaPool.mock.calc_token_amount.returns(0);
    });

    it("should not revert", async () => {
      // await expect(curveStableUsdcStrategy.mockWithdrawSome(ethers.utils.parseEther("2"))).to.not.be.reverted;
      await curveStableUsdcStrategy.mockWithdrawSome(ethers.utils.parseEther("2"));
    });
  });

  describe("_addLiquidityToCurvePool", async () => {
    const tokenAmount = ethers.utils.parseEther("10");
    const crvAmount = ethers.utils.parseEther("20");
    const exchangeAmountOut = ethers.utils.parseEther("10");
    const gaugeBalance = ethers.utils.parseEther("5");
    const withdrawAmountOut = ethers.utils.parseEther("5");
    const metaLpBalance = ethers.utils.parseEther("2");

    beforeEach(async () => {
      vaultToken.mint(curveStableUsdcStrategy.address, tokenAmount);
      mockMetaPoolLpToken.mint(curveStableUsdcStrategy.address, metaLpBalance);
      poolLpToken.mint(curveStableUsdcStrategy.address, metaLpBalance);

      await mockCurveMinter.mock.minted.returns(ethers.constants.Zero);
      await mockDex.mock.getAmountsOut.returns([0, 0, exchangeAmountOut]);
      await mockCurveGauge.mock.balanceOf.returns(gaugeBalance);
      await mockCurveGauge.mock.integrate_fraction.returns(crvAmount);
      await mockCurveGauge.mock.withdraw.returns();
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurvePool.mock.remove_liquidity_one_coin.returns();
      await mockCurvePool.mock.calc_token_amount.returns(0);
      await mockCurveMetaPool.mock.remove_liquidity_one_coin.returns(0);
      await mockCurveMetaPool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurveMetaPool.mock.calc_token_amount.returns(0);
    });

    it("should not revert", async () => {
      // await expect(curveStableUsdcStrategy.mockWithdrawSome(ethers.utils.parseEther("2"))).to.not.be.reverted;
      await curveStableUsdcStrategy.mockWithdrawSome(ethers.utils.parseEther("2"));
    });
  });
});
