import chai, { expect } from "chai";
import { ethers, waffle } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { SingleAssetVault, VaultStrategyDataStore } from "../../../types";
import { CurveStableStrategyMock } from "../../../types/CurveStableStrategyMock";
import { TokenMock } from "../../../types/TokenMock";
import { MockContract, solidity } from "ethereum-waffle";
import { BigNumber } from "ethers";
import { setupVaultAndCurveTrio } from "../fixtures/setup";

import { near } from "../utils/near";
const { loadFixture } = waffle;

chai.use(solidity);
chai.use(near);

describe("CurveStable strategy", async () => {
  let vault: SingleAssetVault;
  let vaultStrategyDataStore: VaultStrategyDataStore;
  let vaultToken: TokenMock;

  let governance: SignerWithAddress;
  let proposer: SignerWithAddress;
  let developer: SignerWithAddress;
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
    proposer = accounts[accounts.length - 1]; // go from the last to avoid conflicts with accounts returned from setupVault
    developer = accounts[accounts.length - 1];
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

    const curveStableUsdcStrategyFactory = await ethers.getContractFactory("CurveStableStrategyMock");
    curveStableUsdcStrategy = (await curveStableUsdcStrategyFactory.deploy(
      vault.address,
      proposer.address,
      developer.address,
      gatekeeper.address,
      mockCurvePool.address
    )) as CurveStableStrategyMock;
    await curveStableUsdcStrategy.deployed();
    await curveStableUsdcStrategy.setTriPoolLpToken(poolLpToken.address);
    await curveStableUsdcStrategy.setMetaPoolLpToken(mockMetaPoolLpToken.address);
    await curveStableUsdcStrategy.setCurveAddressProvider(mockCurveAddressProvider.address);
    await curveStableUsdcStrategy.setCurveMinter(mockCurveMinter.address);
    await curveStableUsdcStrategy.setCurvePool(mockCurvePool.address);
    await curveStableUsdcStrategy.setMetaPool(mockCurveMetaPool.address);
    await curveStableUsdcStrategy.setMockCurveGauge(mockCurveGauge.address);
    await curveStableUsdcStrategy.initCurveGauge();
    await curveStableUsdcStrategy.setDex(mockDex.address);
    await curveStableUsdcStrategy.setCurveTokenAddress(curveToken.address);
    await curveStableUsdcStrategy.connect(governance).approveAll();
  });

  describe("basics", async () => {
    it("should return the correct name", async () => {
      await expect(await curveStableUsdcStrategy.name()).to.be.equal(`CurveStable_${await vaultToken.symbol()}`);
    });
    it("should return the correct information on pool tokens", async () => {
      await expect(await curveStableUsdcStrategy.getCoinsCount()).to.be.equal(BigNumber.from(3));
      await expect(await curveStableUsdcStrategy.getWantTokenIndex()).to.be.equal(BigNumber.from(0));
    });

    it("should return the correct metaPool address", async () => {
      const metaPoolAddress = "0x0f9cb53Ebe405d49A0bbdBD291A65Ff571bC83e1";
      await expect(await curveStableUsdcStrategy.mockGetMetaPool()).to.be.equal(metaPoolAddress);
    });

    it("should return the correct curve pool LP token address", async () => {
      const _3crv = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
      await expect(await curveStableUsdcStrategy.mockGetTriPoolLpToken()).to.be.equal(_3crv);
    });

    it("should return the correct metaPool LP token address", async () => {
      const usdn3crv = "0x4f3E8F405CF5aFC05D68142F3783bDfE13811522";
      await expect(await curveStableUsdcStrategy.mockGetMetaPoolLpToken()).to.be.equal(usdn3crv);
    });

    it("should return the 0 for pool balance", async () => {
      await mockCurveGauge.mock.balanceOf.returns(0);
      await expect(await curveStableUsdcStrategy.mockBalanceOfPool()).to.be.equal(0);
    });
    it("should return the 0 for pool balance", async () => {
      await mockCurveGauge.mock.balanceOf.returns(0);
      await expect(await curveStableUsdcStrategy.mockBalanceOfPool()).to.be.equal(0);
    });

    it("should revert when want token doesn't match any tokens in threepool", async () => {
      await mockCurvePool.mock.coins.withArgs(0).returns(mockDai.address);
      await mockCurvePool.mock.coins.withArgs(1).returns(mockUsdc.address);
      await mockCurvePool.mock.coins.withArgs(2).returns(mockUsdt.address);
      await expect(curveStableUsdcStrategy.mockGetWantIndexInCurvePool(mockCurvePool.address)).to.be.revertedWith(
        "Want token doesnt match any tokens in the curve pool"
      );
    });

    it("should return curve gauge address", async () => {
      const address = await curveStableUsdcStrategy.getCurvePoolGaugeAddress();
      const CURVE_GAUGE_ADDR = "0xF98450B5602fa59CC66e1379DFfB6FDDc724CfC4";
      expect(address).to.equal(CURVE_GAUGE_ADDR);
    });
  });

  describe("estimatedTotalAssets", async () => {
    it("should return 0", async () => {
      // vaultToken.mint(curveStableUsdcStrategy.address, tokenAmount);
      await mockCurveMinter.mock.minted.returns(ethers.constants.Zero);

      await mockDex.mock.getAmountsOut.returns([0, 0, 0]);
      await mockCurveGauge.mock.integrate_fraction.returns(0);
      await mockCurveGauge.mock.balanceOf.returns(0);

      await mockCurvePool.mock.calc_withdraw_one_coin.returns(0);
      await mockCurveMetaPool.mock.calc_withdraw_one_coin.returns(0);
      const got = await curveStableUsdcStrategy.estimatedTotalAssets();
      expect(0).to.equal(got);
    });
    it("should return the correct asset value", async () => {
      const tokenAmount = ethers.utils.parseEther("100");
      const crvAmount = ethers.utils.parseEther("20");
      const exchangeAmountOut = ethers.utils.parseEther("10");
      const gaugeBalance = ethers.utils.parseEther("5");
      const withdrawAmountOut = ethers.utils.parseEther("5");

      vaultToken.mint(curveStableUsdcStrategy.address, tokenAmount);
      await mockCurveMinter.mock.minted.returns(ethers.constants.Zero);

      await mockDex.mock.getAmountsOut.returns([0, 0, exchangeAmountOut]);
      await mockCurveGauge.mock.integrate_fraction.returns(crvAmount);
      await mockCurveGauge.mock.balanceOf.returns(gaugeBalance);

      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurveMetaPool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
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

    it("should not add liquidity with balances =0 ", async () => {
      await curveStableUsdcStrategy.mockAddLiquidityToCurvePool();
    });

    it("should add liquidity with balances > 0", async () => {
      vaultToken.mint(curveStableUsdcStrategy.address, tokenAmount);
      mockMetaPoolLpToken.mint(curveStableUsdcStrategy.address, metaLpBalance);
      poolLpToken.mint(curveStableUsdcStrategy.address, metaLpBalance);

      await mockCurveMinter.mock.minted.returns(ethers.constants.Zero);
      await mockDex.mock.getAmountsOut.returns([0, 0, exchangeAmountOut]);

      await mockCurveGauge.mock.balanceOf.returns(gaugeBalance);
      await mockCurveGauge.mock.integrate_fraction.returns(crvAmount);
      await mockCurveGauge.mock.withdraw.returns();
      await mockCurveGauge.mock["deposit(uint256)"].withArgs(metaLpBalance.toString()).returns();

      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurvePool.mock.remove_liquidity_one_coin.returns();
      await mockCurvePool.mock.calc_token_amount.returns(0);
      await mockCurvePool.mock.add_liquidity.returns();

      await mockCurveMetaPool.mock.remove_liquidity_one_coin.returns(0);
      await mockCurveMetaPool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurveMetaPool.mock.calc_token_amount.returns(0);
      await mockCurveMetaPool.mock.add_liquidity.returns(0);
      await curveStableUsdcStrategy.mockAddLiquidityToCurvePool();
    });
  });

  describe("_removeAllLiquidity", async () => {
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
      await curveStableUsdcStrategy.mockRemoveAllLiquidity();
    });
  });

  describe("depositLPTokens", async () => {
    it("should not revert", async () => {
      await curveStableUsdcStrategy.depositLPTokens();
    });
    it("should not revert", async () => {
      const metaLpBalance = ethers.utils.parseEther("2");
      await mockMetaPoolLpToken.mint(curveStableUsdcStrategy.address, metaLpBalance);
      await mockCurveGauge.mock.deposit.withArgs(metaLpBalance).returns();
      await mockCurveGauge.mock.balanceOf.returns(metaLpBalance);

      await curveStableUsdcStrategy.depositLPTokens();
    });
  });

  describe("approveCurveExtra", async () => {
    it("should not revert", async () => {
      await curveStableUsdcStrategy.initCurvePool(mockCurvePool.address);
      await curveStableUsdcStrategy.approveCurveExtra();
    });

    it("should not revert", async () => {
      const metaLpBalance = ethers.utils.parseEther("2");
      await mockMetaPoolLpToken.mint(curveStableUsdcStrategy.address, metaLpBalance);
      await mockCurveGauge.mock.deposit.withArgs(metaLpBalance).returns();
      await mockCurveGauge.mock.balanceOf.returns(metaLpBalance);
      await curveStableUsdcStrategy.depositLPTokens();
    });
  });

  describe("constructor", async () => {
    it("Should fail with zero address pool", async () => {
      const curveStableUsdcStrategyFactory = await ethers.getContractFactory("CurveStableStrategyMock");
      await expect(
        curveStableUsdcStrategyFactory.deploy(
          vault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          ethers.constants.AddressZero
        )
      ).to.be.revertedWith("invalid pool address");
    });
  });

  describe("approve on init", async () => {
    it("Should fail with zero address pool", async () => {
      await expect(curveStableUsdcStrategy.approveOnInit()).not.to.be.reverted;
    });
  });

  describe("swapToWant", async () => {
    it("Should not fail", async () => {
      await expect(curveStableUsdcStrategy.swapToWant(curveStableUsdcStrategy.address, 0)).not.to.be.reverted;
    });
  });
  describe("getQuoteForTokenToWant", async () => {
    it("Should not fail", async () => {
      await expect(curveStableUsdcStrategy.getQuoteForTokenToWant(curveStableUsdcStrategy.address, 0)).not.to.be.reverted;
    });
  });
  describe("getPoolLPTokenAddress", async () => {
    it("Should be reverted", async () => {
      await expect(curveStableUsdcStrategy.getPoolLPTokenAddress(ethers.constants.AddressZero)).to.be.revertedWith("invalid pool address");
    });
    it("Should return correct LP", async () => {
      await expect(curveStableUsdcStrategy.getPoolLPTokenAddress(mockCurvePool.address)).not.to.be.reverted;
    });
  });
});
