import chai, { expect } from "chai";
import { ethers, waffle } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { CurveMetaStrategyMock } from "../../../../types/CurveMetaStrategyMock";
import { MockContract, solidity } from "ethereum-waffle";
import { BigNumber, ContractFactory } from "ethers";
import { setupCurve, setupMockVault } from "../../fixtures/setup";
import curvePlainPoolTrio from "../../../abis/curvePlainPoolTrio.json";

import { near } from "../../utils/near";
import { CONST } from "../../../constants";
const { loadFixture, deployMockContract } = waffle;

chai.use(solidity);
chai.use(near);

describe("CurveMeta strategy", async () => {
  let mockVault: MockContract;
  let mockVaultToken: MockContract;

  let governance: SignerWithAddress;
  let proposer: SignerWithAddress;
  let developer: SignerWithAddress;
  let deployer: SignerWithAddress;
  let gatekeeper: SignerWithAddress;

  let curveToken: MockContract;
  let poolLpToken: MockContract;
  let curveMetaPoolLPToken: MockContract;

  let mockCurvePool: MockContract;
  let mockCurveMetaPool: MockContract;
  let mockCurveGauge: MockContract;
  let mockCurveMinter: MockContract;
  let mockDex: MockContract;

  let curveMetaStrategy: CurveMetaStrategyMock;
  let curveMetaStrategyFactory: ContractFactory;

  beforeEach(async () => {
    [governance, deployer, gatekeeper, proposer, developer] = await ethers.getSigners();
    ({ mockVault } = await loadFixture(setupMockVault));
    // don't run another `loadFixture` as it will cause some wired issues with hardhat.
    ({ mockCurveMinter, mockCurveGauge, mockDex, poolLpToken, curveToken, mockCurveMetaPool, curveMetaPoolLPToken } = await setupCurve());
    mockCurvePool = await deployMockContract(deployer, curvePlainPoolTrio);

    ({ mockVault, mockVaultToken } = await setupMockVault());
    await mockVault.mock.token.returns(mockVaultToken.address);
    await mockVault.mock.approve.returns(true);
    await mockVault.mock.governance.returns(governance.address);
    await mockVaultToken.mock.allowance.returns(0);
    await mockVaultToken.mock.approve.returns(true);
    await curveToken.mock.allowance.returns(0);
    await curveToken.mock.approve.returns(true);
    await poolLpToken.mock.allowance.returns(0);
    await poolLpToken.mock.approve.returns(true);
    await curveMetaPoolLPToken.mock.allowance.returns(0);
    await curveMetaPoolLPToken.mock.approve.returns(true);

    const curveMetaStrategyFactory = await ethers.getContractFactory("CurveMetaStrategyMock");
    curveMetaStrategy = (await curveMetaStrategyFactory.deploy(
      mockVault.address,
      proposer.address,
      developer.address,
      gatekeeper.address,
      mockCurvePool.address,
      poolLpToken.address,
      mockCurveMetaPool.address,
      curveMetaPoolLPToken.address,
      CONST.THREE_POOL.COINS.USDC,
      CONST.THREE_POOL.NO_OF_COINS,
      mockCurveGauge.address,
      curveToken.address
    )) as CurveMetaStrategyMock;
    await curveMetaStrategy.deployed();
    await curveMetaStrategy.setMockCurveGauge(mockCurveGauge.address);
    await curveMetaStrategy.setDex(mockDex.address);
    await curveMetaStrategy.setCurveMinter(mockCurveMinter.address);
    await curveMetaStrategy.connect(governance).approveAll();
  });

  describe("basics", async () => {
    it("should return the correct name", async () => {
      expect(await curveMetaStrategy.name()).to.be.equal("CurveMeta");
    });
    it("should return the correct information on pool tokens", async () => {
      expect(await curveMetaStrategy.getCoinsCount()).to.be.equal(BigNumber.from(3));
      expect(await curveMetaStrategy.getWantTokenIndex()).to.be.equal(BigNumber.from(0));
    });

    it("should return the correct metaPool address", async () => {
      expect(await curveMetaStrategy.metaPool()).to.be.equal(mockCurveMetaPool.address);
    });

    it("should return the correct curve pool LP token address", async () => {
      expect(await curveMetaStrategy.basePoolLpToken()).to.be.equal(poolLpToken.address);
    });

    it("should return the correct metaPool LP token address", async () => {
      expect(await curveMetaStrategy.metaPoolLpToken()).to.be.equal(curveMetaPoolLPToken.address);
    });

    it("should return the 0 for pool balance", async () => {
      await mockCurveGauge.mock.balanceOf.returns(0);
      expect(await curveMetaStrategy.mockBalanceOfPool()).to.be.equal(0);
    });
    it("should return the 0 for pool balance", async () => {
      await mockCurveGauge.mock.balanceOf.returns(0);
      expect(await curveMetaStrategy.mockBalanceOfPool()).to.be.equal(0);
    });

    it("should return curve gauge address", async () => {
      expect(await curveMetaStrategy.curveGauge()).to.equal(mockCurveGauge.address);
    });
    it("should return the correct balance of pool input token", async () => {
      const vaultTokens = 10;
      await mockVaultToken.mock.balanceOf.returns(vaultTokens);
      expect(await curveMetaStrategy.mockBalanceOfPoolInputToken()).to.equal(vaultTokens);
    });
  });

  describe("estimatedTotalAssets", async () => {
    it("should return 0", async () => {
      await mockCurveMinter.mock.minted.returns(ethers.constants.Zero);
      await mockVaultToken.mock.balanceOf.returns(0);
      await mockDex.mock.getAmountsOut.returns([0, 0, 0]);
      await mockCurveGauge.mock.integrate_fraction.returns(0);
      await mockCurveGauge.mock.balanceOf.returns(0);

      await mockCurvePool.mock.calc_withdraw_one_coin.returns(0);
      await mockCurveMetaPool.mock.calc_withdraw_one_coin.returns(0);
      const got = await curveMetaStrategy.estimatedTotalAssets();
      expect(0).to.equal(got);
    });
    it("should return the correct asset value", async () => {
      const tokenAmount = ethers.utils.parseEther("100");
      const crvAmount = ethers.utils.parseEther("20");
      const exchangeAmountOut = ethers.utils.parseEther("10");
      const gaugeBalance = ethers.utils.parseEther("5");
      const withdrawAmountOut = ethers.utils.parseEther("5");
      await mockVaultToken.mock.balanceOf.returns(tokenAmount);
      await mockCurveMinter.mock.minted.returns(ethers.constants.Zero);

      await mockDex.mock.getAmountsOut.returns([0, 0, exchangeAmountOut]);
      await mockCurveGauge.mock.integrate_fraction.returns(crvAmount);
      await mockCurveGauge.mock.balanceOf.returns(gaugeBalance);

      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurveMetaPool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      const expectedTotal = tokenAmount.add(exchangeAmountOut).add(withdrawAmountOut);
      const got = await curveMetaStrategy.estimatedTotalAssets();
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
      await mockVaultToken.mock.balanceOf.returns(tokenAmount);
      await curveMetaPoolLPToken.mock.balanceOf.returns(metaLpBalance);
      await poolLpToken.mock.balanceOf.returns(metaLpBalance);

      await mockCurveMinter.mock.minted.returns(ethers.constants.Zero);
      await mockDex.mock.getAmountsOut.returns([0, 0, exchangeAmountOut]);

      await mockCurveGauge.mock.balanceOf.returns(gaugeBalance);
      await mockCurveGauge.mock.integrate_fraction.returns(crvAmount);
      await mockCurveGauge.mock.withdraw.returns();

      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurvePool.mock.remove_liquidity_one_coin.returns();
      await mockCurvePool.mock.calc_token_amount.returns(0);

      await mockCurveMetaPool.mock["calc_token_amount(uint256[2],bool)"].returns(0);
      await mockCurveMetaPool.mock.remove_liquidity_one_coin.returns(0);
      await mockCurveMetaPool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
    });

    it("should not revert", async () => {
      await curveMetaStrategy.mockWithdrawSome(ethers.utils.parseEther("2"));
    });
  });

  describe("_addLiquidityToCurvePool", async () => {
    const tokenAmount = ethers.utils.parseEther("10");
    const crvAmount = ethers.utils.parseEther("20");
    const exchangeAmountOut = ethers.utils.parseEther("10");
    const gaugeBalance = ethers.utils.parseEther("5");
    const withdrawAmountOut = ethers.utils.parseEther("5");
    const metaLpBalance = ethers.utils.parseEther("2");

    it("should not add liquidity with balances = 0 ", async () => {
      await mockVaultToken.mock.balanceOf.returns(0);
      await poolLpToken.mock.balanceOf.returns(0);
      await curveMetaStrategy.mockAddLiquidityToCurvePool();
    });

    it("should add liquidity with balances > 0", async () => {
      await mockVaultToken.mock.balanceOf.returns(tokenAmount);
      await curveMetaPoolLPToken.mock.balanceOf.returns(metaLpBalance);
      await poolLpToken.mock.balanceOf.returns(metaLpBalance);

      await mockCurveMinter.mock.minted.returns(ethers.constants.Zero);
      await mockDex.mock.getAmountsOut.returns([0, 0, exchangeAmountOut]);

      await mockCurveGauge.mock.balanceOf.returns(gaugeBalance);
      await mockCurveGauge.mock.integrate_fraction.returns(crvAmount);
      await mockCurveGauge.mock.withdraw.returns();
      await mockCurveGauge.mock["deposit(uint256)"].withArgs(metaLpBalance.toString()).returns();

      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurvePool.mock.remove_liquidity_one_coin.returns();
      await mockCurvePool.mock.calc_token_amount.returns(ethers.utils.parseEther("1"));
      await mockCurvePool.mock["add_liquidity(uint256[3],uint256)"].returns();
      await mockCurveMetaPool.mock.remove_liquidity_one_coin.returns(0);
      await mockCurveMetaPool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurveMetaPool.mock.calc_token_amount.returns(0);
      await mockCurveMetaPool.mock.add_liquidity.returns(tokenAmount);
      await curveMetaStrategy.mockAddLiquidityToCurvePool();
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
      await mockVaultToken.mock.balanceOf.returns(tokenAmount);
      await curveMetaPoolLPToken.mock.balanceOf.returns(metaLpBalance);
      await poolLpToken.mock.balanceOf.returns(metaLpBalance);

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
      await curveMetaStrategy.mockRemoveAllLiquidity();
    });
  });

  describe("depositLPTokens", async () => {
    it("should not revert", async () => {
      await curveMetaPoolLPToken.mock.balanceOf.returns(0);
      await curveMetaStrategy.depositLPTokens();
    });
    it("should not revert", async () => {
      const metaLpBalance = ethers.utils.parseEther("2");
      await curveMetaPoolLPToken.mock.balanceOf.returns(metaLpBalance);
      await mockCurveGauge.mock.deposit.withArgs(metaLpBalance).returns();
      await mockCurveGauge.mock.balanceOf.returns(metaLpBalance);

      await curveMetaStrategy.depositLPTokens();
    });
  });

  describe("approveCurveExtra", async () => {
    it("should not revert", async () => {
      await curveMetaStrategy.approveCurveExtra();
    });

    it("should not revert", async () => {
      const metaLpBalance = ethers.utils.parseEther("2");
      await curveMetaPoolLPToken.mock.balanceOf.returns(metaLpBalance);
      await mockCurveGauge.mock.deposit.withArgs(metaLpBalance).returns();
      await mockCurveGauge.mock.balanceOf.returns(metaLpBalance);
      await curveMetaStrategy.depositLPTokens();
    });
  });

  describe("constructor", async () => {
    it("Should fail with zero address pool", async () => {
      const curveMetaStrategyFactory = await ethers.getContractFactory("CurveMetaStrategyMock");
      await expect(
        curveMetaStrategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          CONST.ADDRESS_ZERO,
          poolLpToken.address,
          mockCurveMetaPool.address,
          curveMetaPoolLPToken.address,
          CONST.THREE_POOL.COINS.USDC,
          CONST.THREE_POOL.NO_OF_COINS,
          mockCurveGauge.address,
          curveToken.address
        )
      ).to.be.revertedWith("!pool");
    });
    it("Should fail with zero address metapool", async () => {
      const curveMetaStrategyFactory = await ethers.getContractFactory("CurveMetaStrategyMock");
      await expect(
        curveMetaStrategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          mockCurvePool.address,
          poolLpToken.address,
          CONST.ADDRESS_ZERO,
          curveMetaPoolLPToken.address,
          CONST.THREE_POOL.COINS.USDC,
          CONST.THREE_POOL.NO_OF_COINS,
          mockCurveGauge.address,
          curveToken.address
        )
      ).to.be.revertedWith("!metaPool");
    });
    it("Should fail with zero address basePoolLpToken", async () => {
      const curveMetaStrategyFactory = await ethers.getContractFactory("CurveMetaStrategyMock");
      await expect(
        curveMetaStrategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          mockCurvePool.address,
          CONST.ADDRESS_ZERO,
          mockCurveMetaPool.address,
          curveMetaPoolLPToken.address,
          CONST.THREE_POOL.COINS.USDC,
          CONST.THREE_POOL.NO_OF_COINS,
          mockCurveGauge.address,
          curveToken.address
        )
      ).to.be.revertedWith("!token");
    });
    it("Should fail with zero address metaPoolLpToken", async () => {
      const curveMetaStrategyFactory = await ethers.getContractFactory("CurveMetaStrategyMock");
      await expect(
        curveMetaStrategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          mockCurvePool.address,
          poolLpToken.address,
          mockCurveMetaPool.address,
          CONST.ADDRESS_ZERO,
          CONST.THREE_POOL.COINS.USDC,
          CONST.THREE_POOL.NO_OF_COINS,
          mockCurveGauge.address,
          curveToken.address
        )
      ).to.be.revertedWith("!token");
    });
    it("Should fail with incorrect noPoolCoins", async () => {
      const curveMetaStrategyFactory = await ethers.getContractFactory("CurveMetaStrategyMock");
      await expect(
        curveMetaStrategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          mockCurvePool.address,
          poolLpToken.address,
          mockCurveMetaPool.address,
          curveMetaPoolLPToken.address,
          CONST.THREE_POOL.COINS.USDC,
          5,
          mockCurveGauge.address,
          curveToken.address
        )
      ).to.be.revertedWith("!poolToken");
    });
    it("Should fail with incorrect indexOfWantInPool", async () => {
      const curveMetaStrategyFactory = await ethers.getContractFactory("CurveMetaStrategyMock");
      await expect(
        curveMetaStrategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          mockCurvePool.address,
          poolLpToken.address,
          mockCurveMetaPool.address,
          curveMetaPoolLPToken.address,
          5,
          CONST.THREE_POOL.NO_OF_COINS,
          mockCurveGauge.address,
          curveToken.address
        )
      ).to.be.revertedWith("!wantIndex");
    });
  });

  describe("approve on init", async () => {
    it("Should fail with zero address pool", async () => {
      await expect(curveMetaStrategy.approveOnInit()).not.to.be.reverted;
    });
  });

  describe("swapToWant", async () => {
    it("Should not fail", async () => {
      await expect(curveMetaStrategy.swapToWant(curveMetaStrategy.address, 0)).not.to.be.reverted;
    });
  });
  describe("getQuoteForTokenToWant", async () => {
    it("Should not fail", async () => {
      await expect(curveMetaStrategy.getQuoteForTokenToWant(curveMetaStrategy.address, 0)).not.to.be.reverted;
    });
  });
});
