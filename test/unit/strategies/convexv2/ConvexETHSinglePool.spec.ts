import { expect } from "chai";
import { ethers, waffle, network } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ConvexETHSinglePoolMock } from "../../../../types/ConvexETHSinglePoolMock";
import { setupMockVault, setupCurve, setupConvex } from "../../fixtures/setup";
import { MockContract } from "ethereum-waffle";
import IWethABI from "../../../../abi/contracts/interfaces/IWeth.sol/IWETH.json";
import { ContractFactory } from "ethers";
const { loadFixture, deployMockContract } = waffle;

const CONVEX_STETH_POOL_ID = 25;
const CONVEX_ANKRETH_POOL_ID = 27;

describe("ConvexETHSinglePool strategy", async () => {
  let mockVault: MockContract;
  let mockVaultToken: MockContract;
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let proposer: SignerWithAddress;
  let developer: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let rewards: SignerWithAddress;
  let newStrategy: SignerWithAddress;
  let poolLpToken: MockContract;
  let curveToken: MockContract;

  let mockCurvePool: MockContract;
  let mockCurveGauge: MockContract;
  let mockCurveMinter: MockContract;
  let mockDex: MockContract;
  let mockConvexBooster: MockContract;
  let mockConvexRewards: MockContract;
  let mockConvexToken: MockContract;
  let mockLdoToken: MockContract;

  let strategy: ConvexETHSinglePoolMock;
  let strategyFactory: ContractFactory;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, rewards, proposer, developer, newStrategy] = await ethers.getSigners();
    ({ mockVault } = await loadFixture(setupMockVault));
    // don't run another `loadFixture` as it will cause some wired issues with hardhat.
    ({ mockCurveMinter, mockCurvePool, mockCurveGauge, mockDex, poolLpToken, curveToken } = await setupCurve());
    ({ mockConvexBooster, mockConvexRewards, mockConvexToken, mockLdoToken } = await setupConvex());
    mockVaultToken = await deployMockContract(deployer, IWethABI);
    await mockVault.mock.token.returns(mockVaultToken.address);
    await mockVault.mock.approve.returns(true);
    await mockVault.mock.governance.returns(governance.address);
    await mockVault.mock.gatekeeper.returns(gatekeeper.address);
    await mockVaultToken.mock.allowance.returns(0);
    await mockVaultToken.mock.approve.returns(true);
    await mockLdoToken.mock.allowance.returns(0);
    await mockLdoToken.mock.approve.returns(true);
    await mockConvexToken.mock.allowance.returns(0);
    await mockConvexToken.mock.approve.returns(true);
    await poolLpToken.mock.allowance.returns(0);
    await poolLpToken.mock.approve.returns(true);
    await curveToken.mock.allowance.returns(0);
    await curveToken.mock.approve.returns(true);
    await mockConvexBooster.mock.poolInfo.returns(
      poolLpToken.address,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      mockConvexRewards.address,
      ethers.constants.AddressZero,
      false
    );
    strategyFactory = await ethers.getContractFactory("ConvexETHSinglePoolMock");
    strategy = (await strategyFactory.deploy(
      mockVault.address,
      proposer.address,
      developer.address,
      gatekeeper.address,
      mockCurvePool.address,
      mockCurveGauge.address,
      1,
      CONVEX_STETH_POOL_ID,
      mockConvexBooster.address,
      mockLdoToken.address
    )) as ConvexETHSinglePoolMock;
    await strategy.deployed();
    await strategy.setConvexTokenAddress(mockConvexToken.address);
    await strategy.setCurve(mockCurveMinter.address, curveToken.address, mockVaultToken.address);
    await strategy.setDex(mockDex.address);
  });

  describe("name", async () => {
    it("should return expected name", async () => {
      expect(await strategy.name()).to.equal("ConvexETHSinglePool");
    });
  });

  describe("deploy parameters", async () => {
    it("should revert if token index is not valid", async () => {
      await expect(
        strategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          mockCurvePool.address,
          mockCurveGauge.address,
          2,
          CONVEX_STETH_POOL_ID,
          mockConvexBooster.address,
          mockLdoToken.address
        )
      ).to.be.revertedWith("!inputTokenIndex");
    });
  });

  describe("checkWantToken", async () => {
    it("should fail if token address is not the want one", async () => {
      await expect(strategy.setWETHTokenAddress(newStrategy.address)).to.be.revertedWith("wrong vault token");
      await expect(strategy.setWETHTokenAddress(mockVaultToken.address)).not.to.be.reverted;
    });
  });

  describe("estimatedTotalAssets", async () => {
    it("should return the correct asset value", async () => {
      const tokenAmount = ethers.utils.parseEther("100");
      const crvAmount = ethers.utils.parseEther("20");
      const exchangeAmountOut = ethers.utils.parseEther("10");
      const gaugeBalance = ethers.utils.parseEther("5");
      const withdrawAmountOut = ethers.utils.parseEther("5");
      const cvxEarned = ethers.utils.parseEther("11");
      const cvxBalance = ethers.utils.parseEther("10");
      const csvTotalSupply = ethers.utils.parseEther("100000");

      await mockVaultToken.mock.balanceOf.returns(tokenAmount);
      await mockConvexToken.mock.totalSupply.returns(csvTotalSupply);
      await mockCurveGauge.mock.integrate_fraction.returns(crvAmount);
      await mockCurveMinter.mock.minted.returns(ethers.constants.Zero);
      await mockDex.mock.getAmountsOut.returns([0, exchangeAmountOut]);
      await mockCurveGauge.mock.balanceOf.returns(gaugeBalance);
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockConvexRewards.mock.earned.returns(cvxEarned);
      await mockConvexRewards.mock.balanceOf.returns(cvxBalance);
      const expectedTotal = tokenAmount.add(exchangeAmountOut).add(withdrawAmountOut).add(cvxBalance);
      const got = await strategy.estimatedTotalAssets();
      expect(expectedTotal).to.equal(got);
    });
  });

  describe("approveAll", async () => {
    it("should revert if the user is not authorised", async () => {
      await expect(strategy.approveAll()).to.be.revertedWith("!authorized");
    });
    it("should approve on required tokens", async () => {
      await poolLpToken.mock.allowance.returns(0);
      await poolLpToken.mock.approve.returns(true);
      await curveToken.mock.allowance.returns(0);
      await curveToken.mock.approve.returns(true);
      await strategy.connect(developer).approveAll();
    });
  });

  describe("adjustPosition", async () => {
    it("should success when balance is not 0", async () => {
      const balance = ethers.utils.parseEther("1");
      await mockVault.mock.debtOutstanding.returns(0);
      await mockVaultToken.mock.balanceOf.returns(balance);
      await mockVaultToken.mock.withdraw.returns();
      await poolLpToken.mock.balanceOf.returns(balance);
      await mockCurveGauge.mock["deposit(uint256)"].withArgs(balance.toString()).returns();
      await mockCurvePool.mock.add_liquidity.returns(1);
      await mockConvexBooster.mock.depositAll.returns(true);
      await mockLdoToken.mock.balanceOf.returns(0);
      await curveToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseEther("0.5")]);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      // need to make sure the strategy have some ether in order to deposit.
      // sending eth can't be mocked
      await network.provider.send("hardhat_setBalance", [strategy.address, ethers.utils.parseEther("10").toHexString()]);
      await expect(strategy.connect(developer).tend()).not.to.be.reverted;
    });

    it("should success when balance is 0", async () => {
      const balance = ethers.constants.Zero;
      await mockVault.mock.debtOutstanding.returns(0);
      await mockVaultToken.mock.balanceOf.returns(balance);
      await poolLpToken.mock.balanceOf.returns(balance);
      await mockConvexBooster.mock.depositAll.returns(true);
      await mockLdoToken.mock.balanceOf.returns(0);
      await curveToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseEther("0.5")]);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));

      await expect(strategy.connect(developer).tend()).not.to.be.reverted;
    });

    it("should return the 0 for pool balance", async () => {
      await mockCurveGauge.mock.balanceOf.returns(0);
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseEther("0"));

      await expect(await strategy.balanceOfPool()).to.be.equal(0);
    });

    it("should not do anything if emergency exit", async () => {
      await mockVault.mock.revokeStrategy.returns();
      await mockVault.mock.debtOutstanding.returns(0);
      await strategy.connect(governance).setEmergencyExit();
      await expect(strategy.connect(developer).tend()).not.to.be.reverted;
    });
  });

  describe("prepareReturn", async () => {
    beforeEach(async () => {
      const csvTotalSupply = ethers.utils.parseEther("100000");
      await mockConvexToken.mock.totalSupply.returns(csvTotalSupply);
    });
    it("should report no loss", async () => {
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockDex.mock.swapExactTokensForTokens.returns([0, ethers.utils.parseEther("0.5")]);
      await mockCurveGauge.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(ethers.utils.parseEther("2"));
      const res = { activation: 0, totalDebt: ethers.utils.parseEther("2"), lastReport: 0, totalGain: 0, totalLoss: 0 };
      await mockVault.mock.strategy.returns(res);
      await mockCurveGauge.mock.integrate_fraction.returns(ethers.utils.parseEther("1"));
      await mockCurveMinter.mock.minted.returns(ethers.utils.parseEther("0.5"));
      await mockDex.mock.getAmountsOut.returns([0, ethers.utils.parseEther("0.5")]);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseEther("1"));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockLdoToken.mock.balanceOf.returns(ethers.utils.parseEther("0.5"));
      // no profit to report as we can't change the balanceOf what based the number of calls, so it will always be 0
      // no loss here as the debt value (2) is smaller than the estmiated total value (3.5)
      // no debt payment either
      expect(await strategy.testPrepareReturn(ethers.constants.Zero))
        .to.emit(strategy, "ReturnsReported")
        .withArgs(ethers.constants.Zero, ethers.constants.Zero, ethers.constants.Zero);
    });

    it("should report loss", async () => {
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockDex.mock.swapExactTokensForTokens.returns([0, ethers.utils.parseEther("0.5")]);
      await mockCurveGauge.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(ethers.utils.parseEther("2"));
      const res = { activation: 0, totalDebt: ethers.utils.parseEther("4"), lastReport: 0, totalGain: 0, totalLoss: 0 };
      await mockVault.mock.strategy.returns(res);
      await mockCurveGauge.mock.integrate_fraction.returns(ethers.utils.parseEther("1"));
      await mockCurveMinter.mock.minted.returns(ethers.utils.parseEther("0.5"));
      await mockDex.mock.getAmountsOut.returns([0, ethers.utils.parseEther("0.5")]);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseEther("0"));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseEther("0"));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockLdoToken.mock.balanceOf.returns(ethers.utils.parseEther("0.5"));
      // no profit to report as we can't change the balanceOf what based the number of calls, so it will always be 0
      // there is loss here as the debt value (4) is bigger than the estmiated total value (3.5)
      // no debt payment either
      expect(await strategy.testPrepareReturn(ethers.constants.Zero))
        .to.emit(strategy, "ReturnsReported")
        .withArgs(ethers.constants.Zero, ethers.utils.parseEther("3"), ethers.constants.Zero);
    });

    it("should report debtPayment", async () => {
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockDex.mock.swapExactTokensForTokens.returns([0, ethers.utils.parseEther("0.5")]);
      await mockCurveGauge.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(ethers.utils.parseEther("2"));
      const res = { activation: 0, totalDebt: ethers.utils.parseEther("4"), lastReport: 0, totalGain: 0, totalLoss: 0 };
      await mockVault.mock.strategy.returns(res);
      await mockCurveGauge.mock.integrate_fraction.returns(ethers.utils.parseEther("1"));
      await mockCurveMinter.mock.minted.returns(ethers.utils.parseEther("0.5"));
      await mockDex.mock.getAmountsOut.returns([0, ethers.utils.parseEther("0.5")]);
      await mockCurvePool.mock["calc_token_amount(uint256[2],bool)"].returns(ethers.utils.parseEther("0.5"));
      await mockCurveGauge.mock.withdraw.returns();
      await mockCurvePool.mock.remove_liquidity_one_coin.returns(ethers.utils.parseEther("0.5"));
      await mockVaultToken.mock.deposit.returns();
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseEther("0"));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseEther("0"));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockLdoToken.mock.balanceOf.returns(ethers.utils.parseEther("0.5"));
      // needed to exchange eth to weth
      await network.provider.send("hardhat_setBalance", [strategy.address, ethers.utils.parseEther("10").toHexString()]);
      // no profit to report as we can't change the balanceOf what based the number of calls, so it will always be 0
      // there is loss here as the debt value (4) is bigger than the estmiated total value (3.5)
      // debtpayment is 1
      expect(await strategy.testPrepareReturn(ethers.utils.parseEther("1")))
        .to.emit(strategy, "ReturnsReported")
        .withArgs(ethers.constants.Zero, ethers.utils.parseEther("3"), ethers.utils.parseEther("1"));
    });
  });

  describe("prepareMigration", async () => {
    beforeEach(async () => {
      const csvTotalSupply = ethers.utils.parseEther("100000");
      await mockConvexToken.mock.totalSupply.returns(csvTotalSupply);
    });
    it("should success", async () => {
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.transfer.returns(true);
      await curveToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockDex.mock.swapExactTokensForTokens.returns([0, ethers.utils.parseEther("1")]);
      await mockCurveGauge.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockCurveGauge.mock.withdraw.returns();
      await mockCurvePool.mock.remove_liquidity_one_coin.returns(ethers.utils.parseEther("1"));
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseEther("1"));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await network.provider.send("hardhat_setBalance", [strategy.address, ethers.utils.parseEther("10").toHexString()]);
      await mockVaultToken.mock.deposit.returns();
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockLdoToken.mock.balanceOf.returns(ethers.utils.parseEther("0.5"));
      await strategy.testPrepareMigration(newStrategy.address);
      await expect(strategy.testPrepareMigration(newStrategy.address)).not.to.be.reverted;
    });
  });

  describe("liquidatePosition", async () => {
    beforeEach(async () => {
      const csvTotalSupply = ethers.utils.parseEther("100000");
      await mockConvexToken.mock.totalSupply.returns(csvTotalSupply);
    });
    it("success when withdraw is not needed", async () => {
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockDex.mock.swapExactTokensForTokens.returns([0, ethers.utils.parseEther("1")]);
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseEther("3"));
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseEther("1"));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockLdoToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      // want is less than balance, so no withdraw is needed
      await expect(await strategy.testLiquidatePosition(ethers.utils.parseEther("2")))
        .to.emit(strategy, "LiquidationReported")
        .withArgs(ethers.utils.parseEther("2"), 0);
    });

    it("success when withdraw is needed", async () => {
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockDex.mock.swapExactTokensForTokens.returns([0, ethers.utils.parseEther("1")]);
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockCurvePool.mock["calc_token_amount(uint256[2],bool)"].returns(ethers.utils.parseEther("1"));

      await mockCurveGauge.mock.balanceOf.returns(ethers.utils.parseEther("0.5"));
      await mockCurveGauge.mock.withdraw.returns();
      await mockCurvePool.mock.remove_liquidity_one_coin.returns(ethers.utils.parseEther("0.5"));
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseEther("1"));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await network.provider.send("hardhat_setBalance", [strategy.address, ethers.utils.parseEther("10").toHexString()]);
      await mockVaultToken.mock.deposit.returns();
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockLdoToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      // want is more than balance, so withdraw is needed
      // total liquidated = balance + remove_liquidity_one_coin = 1.5
      // total want = 2
      // loss = 0.5
      await expect(await strategy.testLiquidatePosition(ethers.utils.parseEther("2")))
        .to.emit(strategy, "LiquidationReported")
        .withArgs(ethers.utils.parseEther("1"), ethers.utils.parseEther("1"));
    });
  });

  describe("protectedTokens", async () => {
    it("should return the expected protected tokens", async () => {
      const tokens = await strategy.testProtectedTokens();
      expect(tokens).to.deep.equal([curveToken.address, poolLpToken.address]);
    });
  });
  describe("onHarvest", async () => {
    it("should set the user checkpoint", async () => {
      await mockCurveGauge.mock.user_checkpoint.returns(true);
      await expect(strategy.testOnHarvest()).not.to.be.reverted;
    });
  });

  describe("withdrawSome", async () => {
    beforeEach(async () => {
      await mockCurveGauge.mock.balanceOf.returns(0);
      await mockCurveGauge.mock["withdraw(uint256)"].returns();
      await mockCurvePool.mock.remove_liquidity_one_coin.returns(0);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseEther("1"));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockLdoToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockVaultToken.mock.deposit.returns();
    });
    it("should not revert with 2", async () => {
      await mockCurvePool.mock["calc_token_amount(uint256[2],bool)"].returns(0);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseEther("1"));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await expect(strategy.withdrawSome(1000)).not.to.be.reverted;
    });
  });
});
