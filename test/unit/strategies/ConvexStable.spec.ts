import chai, { expect } from "chai";
import { ethers, waffle } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { SingleAssetVault, VaultStrategyDataStore } from "../../../types";
import { ConvexStableStrategyMock } from "../../../types/ConvexStableStrategyMock";
import { TokenMock } from "../../../types/TokenMock";
import { MockContract, solidity } from "ethereum-waffle";

import { setupConvexMocks } from "../fixtures/setup";

import { near } from "../utils/near";
const { loadFixture } = waffle;

chai.use(solidity);
chai.use(near);

const USDC_DECIMALS = 6;

describe("Convex Stable strategy", async () => {
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
  let mockConvexToken: TokenMock;

  let mockDai: MockContract;
  let mockUsdc: MockContract;
  let mockUsdt: MockContract;

  let mockCurvePool: MockContract;
  let mockCurveMetaPool: MockContract;
  let mockCurveGauge: MockContract;
  let mockCurveMinter: MockContract;
  let mockConvexBooster: MockContract;
  let mockConvexRewards: MockContract;
  let mockCurveAddressProvider: MockContract;
  let mockDex: MockContract;

  let convexStableStrategy: ConvexStableStrategyMock;

  beforeEach(async () => {
    const accounts = await ethers.getSigners();
    proposer = accounts[accounts.length - 1]; // go from the last to avoid conflicts with accounts returned from setupVault
    developer = accounts[accounts.length - 2];
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
      mockConvexBooster,
      mockConvexRewards,
      mockConvexToken,
    } = await setupConvexMocks());

    // @dev syntax to mock a struct in solidity
    await mockConvexBooster.mock.poolInfo
      .withArgs(13)
      .returns(
        poolLpToken.address,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        mockConvexRewards.address,
        ethers.constants.AddressZero,
        false
      );

    const convexStableStrategyFactory = await ethers.getContractFactory("ConvexStableStrategyMock");
    convexStableStrategy = (await convexStableStrategyFactory.deploy(
      vault.address,
      proposer.address,
      developer.address,
      gatekeeper.address,
      mockCurvePool.address,
      mockConvexBooster.address
    )) as ConvexStableStrategyMock;
    await convexStableStrategy.deployed();
    await convexStableStrategy.setMetaPoolLpToken(mockMetaPoolLpToken.address);
    await convexStableStrategy.setMetaPool(mockCurveMetaPool.address);
    await convexStableStrategy.setConvexTokenAddress(mockConvexToken.address);
    await convexStableStrategy.setTriPoolLpToken(poolLpToken.address);
    await convexStableStrategy.setDex(mockDex.address);
    await convexStableStrategy.setCurveTokenAddress(curveToken.address);
    await convexStableStrategy.setCurvePool(mockCurvePool.address);
  });

  describe("basics", async () => {
    it("should return the correct name", async () => {
      await expect(await convexStableStrategy.name()).to.be.equal(`ConvexStable_${await vaultToken.symbol()}`);
    });
  });

  describe("estimatedTotalAssets", async () => {
    const tokenAmount = ethers.utils.parseEther("100");
    const totalSupply = ethers.utils.parseEther("1000000");
    const cvxEarned = ethers.utils.parseEther("15");
    const cvxBalance = ethers.utils.parseEther("15");
    const exchangeAmountOut = ethers.utils.parseEther("15");
    const withdrawAmountOut = ethers.utils.parseEther("10");

    beforeEach(async () => {
      vaultToken.mint(convexStableStrategy.address, tokenAmount);
      await mockCurveMinter.mock.minted.returns(ethers.constants.Zero);
      await mockDex.mock.getAmountsOut.returns([0, 0, exchangeAmountOut]);
      await mockConvexRewards.mock.earned.returns(cvxEarned);
      await mockConvexRewards.mock.balanceOf.returns(cvxBalance);
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurveMetaPool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
    });

    it("should return the correct asset value", async () => {
      const expectedTotal = tokenAmount.add(exchangeAmountOut).add(withdrawAmountOut).add(cvxBalance);
      const got = await convexStableStrategy.estimatedTotalAssets();
      expect(expectedTotal).to.equal(got);
    });
  });

  describe("withdrawSome", async () => {
    const tokenAmount = ethers.utils.parseEther("1000");
    const crvAmount = ethers.utils.parseEther("20");
    const exchangeAmountOut = ethers.utils.parseEther("10");
    const gaugeBalance = ethers.utils.parseEther("5");
    const withdrawAmountOut = ethers.utils.parseEther("5");
    const metaLpBalance = ethers.utils.parseEther("2");

    beforeEach(async () => {
      vaultToken.mint(convexStableStrategy.address, tokenAmount);
      mockMetaPoolLpToken.mint(convexStableStrategy.address, metaLpBalance);
      poolLpToken.mint(convexStableStrategy.address, metaLpBalance);
      await mockCurveMinter.mock.minted.returns(ethers.constants.Zero);
      await mockDex.mock.getAmountsOut.returns([0, 0, exchangeAmountOut]);
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurvePool.mock.remove_liquidity_one_coin.returns();
      await mockCurvePool.mock.calc_token_amount.returns(0);
      await mockCurveMetaPool.mock.remove_liquidity_one_coin.returns(0);
      await mockCurveMetaPool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurveMetaPool.mock.calc_token_amount.returns(0);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(0);
      await mockConvexRewards.mock.balanceOf.returns(0);
    });

    it("should not revert when withdrawing", async () => {
      await expect(convexStableStrategy.mockWithdrawSome(ethers.utils.parseUnits("500", USDC_DECIMALS))).not.to.be.reverted;
    });
  });

  describe("_removeAllLiquidity", async () => {
    const tokenAmount = ethers.utils.parseEther("10");
    const exchangeAmountOut = ethers.utils.parseEther("10");
    const withdrawAmountOut = ethers.utils.parseEther("5");
    const metaLpBalance = ethers.utils.parseEther("2");

    beforeEach(async () => {
      vaultToken.mint(convexStableStrategy.address, tokenAmount);
      mockMetaPoolLpToken.mint(convexStableStrategy.address, metaLpBalance);
      poolLpToken.mint(convexStableStrategy.address, metaLpBalance);

      await mockCurveMinter.mock.minted.returns(ethers.constants.Zero);
      await mockDex.mock.getAmountsOut.returns([0, 0, exchangeAmountOut]);
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurvePool.mock.remove_liquidity_one_coin.returns();
      await mockCurvePool.mock.calc_token_amount.returns(0);
      await mockCurveMetaPool.mock.remove_liquidity_one_coin.returns(0);
      await mockCurveMetaPool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurveMetaPool.mock.calc_token_amount.returns(0);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(0);
      await mockConvexRewards.mock.balanceOf.returns(0);
      await mockConvexRewards.mock.earned.returns(0);
    });

    it("should not revert when calling removeAllLiquidity", async () => {
      await expect(await convexStableStrategy.mockRemoveAllLiquidity());
    });
  });

  describe("protectedTokens", async () => {
    it("should return the expected protected tokens", async () => {
      const tokens = await convexStableStrategy.mockProtectedTokens();
      const expected = [
        await convexStableStrategy.curveTokenAddress(),
        await convexStableStrategy.getConvexTokenAddress(),
        await convexStableStrategy.lpToken(),
      ];
      expect(tokens).to.deep.equal(expected);
    });
  });

  describe("claimRewards", async () => {
    beforeEach(async () => {
      await mockConvexRewards.mock.getReward.returns(true);
    });

    it("should not revert when claiming rewards", async () => {
      await expect(convexStableStrategy.mockClaimRewards()).not.to.be.reverted;
    });
  });

  describe("depositToConvex", async () => {
    beforeEach(async () => {
      const tokenAmount = ethers.utils.parseEther("10");
      poolLpToken.mint(convexStableStrategy.address, tokenAmount);
      await mockConvexBooster.mock.depositAll.returns(true);
    });

    it("should deposit to convex", async () => {
      await expect(convexStableStrategy.mockDepositToConvex()).not.to.be.reverted;
    });
  });

  describe("approve Dex", async () => {
    it("should approve the dex", async () => {
      await expect(convexStableStrategy.mockApproveDex()).not.to.be.reverted;
    });
  });
  describe("onHarvest", async () => {
    it("should not do anything", async () => {
      await expect(convexStableStrategy.mockOnHarvest()).not.to.be.reverted;
    });
  });
});
