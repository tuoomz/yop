import { expect } from "chai";
import { ethers, waffle, network } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ConvexERC20SinglePoolMock } from "../../../../types/ConvexERC20SinglePoolMock";
import { setupMockVault, setupCurve, setupConvex } from "../../fixtures/setup";
import { MockContract } from "ethereum-waffle";
import ERC20ABI from "../../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import CurvePlainPoolABI from "../../../abis/curvePlainPool.json";
import CurvePlainPoolTrioABI from "../../../abis/curvePlainPoolTrio.json";
import CurveZapPoolABI from "../../../abis/curvePoolZapDepositor.json";
import ConvexRewardsABI from "../../../abis/convexBaseRewards.json";
import { ContractFactory } from "ethers";
const { loadFixture, deployMockContract } = waffle;

const TOKEN_DECIMALS = 8;
const SUSHISWAP_DEX_ADDRESS = "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F";
const UNISWAP_DEX_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

const CONVEX_OBTC_POOL_ID = 20;
const CONVEX_REN_BTC_POOL_ID = 6;

describe("ConvexERC20SinglePool strategy", async () => {
  let mockVault: MockContract;
  let mockVaultToken: MockContract;
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let proposer: SignerWithAddress;
  let developer: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let rewards: SignerWithAddress;
  let user: SignerWithAddress;
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
  let strategy: ConvexERC20SinglePoolMock;
  let strategyFactory: ContractFactory;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, rewards, proposer, developer, newStrategy] = await ethers.getSigners();
    ({ mockVault } = await loadFixture(setupMockVault));
    user = (await ethers.getSigners()).reverse()[0];
    // don't run another `loadFixture` as it will cause some wired issues with hardhat.
    ({ mockCurveMinter, mockCurveGauge, mockDex, poolLpToken, curveToken } = await setupCurve());
    ({ mockConvexBooster, mockConvexRewards, mockConvexToken } = await setupConvex());
    mockCurvePool = await deployMockContract(deployer, CurvePlainPoolABI);
    mockVaultToken = await deployMockContract(deployer, ERC20ABI);
    await mockVault.mock.token.returns(mockVaultToken.address);
    await mockVault.mock.approve.returns(true);
    await mockVault.mock.governance.returns(governance.address);
    await mockVault.mock.gatekeeper.returns(gatekeeper.address);
    await mockVaultToken.mock.allowance.returns(0);
    await mockVaultToken.mock.approve.returns(true);
    await mockVaultToken.mock.symbol.returns("MockToken");
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
    strategyFactory = await ethers.getContractFactory("ConvexERC20SinglePoolMock");
    strategy = (await strategyFactory.deploy(
      mockVault.address,
      proposer.address,
      developer.address,
      gatekeeper.address,
      mockCurvePool.address,
      mockCurveGauge.address,
      2,
      1,
      mockVaultToken.address,
      false,
      CONVEX_OBTC_POOL_ID,
      mockConvexBooster.address
    )) as ConvexERC20SinglePoolMock;
    await strategy.deployed();
    await strategy.setConvexTokenAddress(mockConvexToken.address);
    await strategy.setCurve(mockCurveMinter.address, curveToken.address);
    await strategy.setDex(mockDex.address);
  });

  describe("deploy parameters", async () => {
    it("should revert if pool address is not valid", async () => {
      await expect(
        strategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          ethers.constants.AddressZero,
          mockCurveGauge.address,
          2,
          1,
          mockVaultToken.address,
          false,
          CONVEX_OBTC_POOL_ID,
          mockConvexBooster.address
        )
      ).to.be.revertedWith("!pool");
    });
    it("should revert if gauge address is not valid", async () => {
      await expect(
        strategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          mockCurvePool.address,
          ethers.constants.AddressZero,
          2,
          1,
          mockVaultToken.address,
          false,
          CONVEX_OBTC_POOL_ID,
          mockConvexBooster.address
        )
      ).to.be.revertedWith("!gauge");
    });
    it("should revert if number of pool tokens are not valid", async () => {
      await expect(
        strategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          mockCurvePool.address,
          mockCurveGauge.address,
          1,
          1,
          mockVaultToken.address,
          false,
          CONVEX_OBTC_POOL_ID,
          mockConvexBooster.address
        )
      ).to.be.revertedWith("!poolToken");
      await expect(
        strategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          mockCurvePool.address,
          mockCurveGauge.address,
          5,
          1,
          mockVaultToken.address,
          false,
          CONVEX_OBTC_POOL_ID,
          mockConvexBooster.address
        )
      ).to.be.revertedWith("!poolToken");
    });
    it("should revert if the index of input token is not valid", async () => {
      await expect(
        strategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          mockCurvePool.address,
          mockCurveGauge.address,
          2,
          2,
          mockVaultToken.address,
          false,
          CONVEX_OBTC_POOL_ID,
          mockConvexBooster.address
        )
      ).to.be.revertedWith("!inputTokenIndex");
    });
    it("should revert if input token address is not valid", async () => {
      await expect(
        strategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          mockCurvePool.address,
          mockCurveGauge.address,
          2,
          1,
          curveToken.address,
          false,
          CONVEX_OBTC_POOL_ID,
          mockConvexBooster.address
        )
      ).to.be.revertedWith("!inputToken");
    });
  });

  describe("name", async () => {
    it("should return expected name", async () => {
      expect(await strategy.name()).to.equal("ConvexERC20SinglePool_MockToken");
    });
  });

  describe("switchDex", async () => {
    it("should fail if user is not authorised", async () => {
      await expect(strategy.connect(user).switchDex(true)).to.be.revertedWith("!authorized");
    });
    it("should change dex", async () => {
      await curveToken.mock.allowance.returns(0);
      await curveToken.mock.approve.returns(true);
      expect(await strategy.dex()).to.equal(mockDex.address);
      await strategy.connect(governance).switchDex(true);
      expect(await strategy.dex()).to.equal(UNISWAP_DEX_ADDRESS);
      await strategy.connect(governance).switchDex(false);
      expect(await strategy.dex()).to.equal(SUSHISWAP_DEX_ADDRESS);
      // this will fail if the strategy asks for token approval for the same dex again
      await curveToken.mock.allowance.returns(1000);
      await strategy.connect(governance).switchDex(true);
      expect(await strategy.dex()).to.equal(UNISWAP_DEX_ADDRESS);
    });
  });

  describe("estimatedTotalAssets", async () => {
    it("should return the correct asset value", async () => {
      const tokenAmount = ethers.utils.parseUnits("100", TOKEN_DECIMALS);
      const crvAmount = ethers.utils.parseUnits("20", TOKEN_DECIMALS);
      const exchangeAmountOut = ethers.utils.parseUnits("11", TOKEN_DECIMALS);
      const gaugeBalance = ethers.utils.parseUnits("5", TOKEN_DECIMALS);
      const withdrawAmountOut = ethers.utils.parseUnits("5", TOKEN_DECIMALS);
      const cvxEarned = ethers.utils.parseUnits("17", TOKEN_DECIMALS);
      const cvxBalance = ethers.utils.parseUnits("11", TOKEN_DECIMALS);
      const csvTotalSupply = ethers.utils.parseUnits("100000", TOKEN_DECIMALS);

      await mockVaultToken.mock.balanceOf.returns(tokenAmount);
      await mockConvexToken.mock.totalSupply.returns(csvTotalSupply);
      await mockCurveGauge.mock.integrate_fraction.returns(crvAmount);
      await mockCurveMinter.mock.minted.returns(ethers.constants.Zero);
      await mockDex.mock.getAmountsOut.returns([0, 0, exchangeAmountOut]);
      await mockCurveGauge.mock.balanceOf.returns(gaugeBalance);
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockConvexRewards.mock.earned.returns(cvxEarned);
      await mockConvexRewards.mock.balanceOf.returns(cvxBalance);

      const expectedTotal = tokenAmount.add(exchangeAmountOut).add(withdrawAmountOut).add(cvxBalance);
      const got = await strategy.estimatedTotalAssets();

      expect(expectedTotal).to.equal(got);
    });

    it("no rewards", async () => {
      const tokenAmount = ethers.utils.parseEther("100");
      const crvAmount = ethers.utils.parseEther("20");
      const gaugeBalance = ethers.utils.parseEther("5");
      const withdrawAmountOut = ethers.utils.parseEther("5");
      const cvxEarned = ethers.utils.parseUnits("0", TOKEN_DECIMALS);
      const cvxBalance = ethers.utils.parseUnits("5", TOKEN_DECIMALS);
      await mockVaultToken.mock.balanceOf.returns(tokenAmount);
      await mockCurveGauge.mock.integrate_fraction.returns(crvAmount);
      await mockCurveMinter.mock.minted.returns(crvAmount);
      await mockCurveGauge.mock.balanceOf.returns(gaugeBalance);
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockConvexRewards.mock.earned.returns(cvxEarned);
      await mockConvexRewards.mock.balanceOf.returns(cvxBalance);
      const expectedTotal = tokenAmount.add(withdrawAmountOut);
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
      await mockVaultToken.mock.allowance.returns(0);
      await mockVault.mock.approve.returns(true);
      await strategy.connect(developer).approveAll();
    });
  });

  describe("adjustPosition", async () => {
    it("should success when balance is not 0", async () => {
      const balance = ethers.utils.parseUnits("1", TOKEN_DECIMALS);
      await mockVault.mock.debtOutstanding.returns(0);
      await mockVaultToken.mock.balanceOf.returns(balance);
      await poolLpToken.mock.balanceOf.returns(balance);
      await mockCurveGauge.mock["deposit(uint256)"].withArgs(balance.toString()).returns();
      await mockCurvePool.mock.add_liquidity.returns(1);
      await mockConvexBooster.mock.depositAll.returns(true);
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("0.5", TOKEN_DECIMALS)]);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await expect(strategy.connect(developer).tend()).not.to.be.reverted;
    });

    it("should success when balance is 0", async () => {
      const balance = ethers.constants.Zero;
      await mockVault.mock.debtOutstanding.returns(0);
      await mockVaultToken.mock.balanceOf.returns(balance);
      await poolLpToken.mock.balanceOf.returns(balance);
      await mockConvexBooster.mock.depositAll.returns(true);
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("0.5", TOKEN_DECIMALS)]);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));

      await expect(strategy.connect(developer).tend()).not.to.be.reverted;
    });

    it("should not do anything if emergency exit", async () => {
      await mockVault.mock.revokeStrategy.returns();
      await mockVault.mock.debtOutstanding.returns(0);
      await strategy.connect(governance).setEmergencyExit();
      await expect(strategy.connect(developer).tend()).not.to.be.reverted;
    });

    it("should success for 3-token pools", async () => {
      mockCurvePool = await deployMockContract(deployer, CurvePlainPoolTrioABI);
      strategy = (await strategyFactory.deploy(
        mockVault.address,
        proposer.address,
        developer.address,
        gatekeeper.address,
        mockCurvePool.address,
        mockCurveGauge.address,
        3,
        1,
        mockVaultToken.address,
        false,
        CONVEX_OBTC_POOL_ID,
        mockConvexBooster.address
      )) as ConvexERC20SinglePoolMock;
      await strategy.deployed();
      await strategy.setDex(mockDex.address);
      await strategy.setConvexTokenAddress(mockConvexToken.address);
      await strategy.setCurve(mockCurveMinter.address, curveToken.address);

      const balance = ethers.utils.parseUnits("1", TOKEN_DECIMALS);
      await mockVault.mock.debtOutstanding.returns(0);
      await mockVaultToken.mock.balanceOf.returns(balance);
      await poolLpToken.mock.balanceOf.returns(balance);
      await mockCurveGauge.mock["deposit(uint256)"].withArgs(balance.toString()).returns();
      await mockCurvePool.mock["add_liquidity(uint256[3],uint256)"].returns();
      await mockConvexBooster.mock.depositAll.returns(true);

      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("0.5", TOKEN_DECIMALS)]);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));

      await expect(strategy.connect(developer).tend()).not.to.be.reverted;
    });

    it("should success for zap pools", async () => {
      mockCurvePool = await deployMockContract(deployer, CurveZapPoolABI);
      strategy = (await strategyFactory.deploy(
        mockVault.address,
        proposer.address,
        developer.address,
        gatekeeper.address,
        mockCurvePool.address,
        mockCurveGauge.address,
        4,
        1,
        mockVaultToken.address,
        true,
        CONVEX_OBTC_POOL_ID,
        mockConvexBooster.address
      )) as ConvexERC20SinglePoolMock;
      await strategy.deployed();
      await strategy.setDex(mockDex.address);
      await strategy.setConvexTokenAddress(mockConvexToken.address);
      await strategy.setCurve(mockCurveMinter.address, curveToken.address);
      const balance = ethers.utils.parseUnits("1", TOKEN_DECIMALS);
      await mockVault.mock.debtOutstanding.returns(0);
      await mockVaultToken.mock.balanceOf.returns(balance);
      await poolLpToken.mock.balanceOf.returns(balance);
      await mockCurveGauge.mock["deposit(uint256)"].withArgs(balance.toString()).returns();
      await mockCurvePool.mock["add_liquidity(uint256[4],uint256)"].returns(1);
      await mockConvexBooster.mock.depositAll.returns(true);

      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("0.5", TOKEN_DECIMALS)]);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));

      await strategy.connect(developer).tend();
      await expect(strategy.connect(developer).tend()).not.to.be.reverted;
    });
  });

  describe("prepareReturn", async () => {
    beforeEach(async () => {
      const csvTotalSupply = ethers.utils.parseUnits("100000", TOKEN_DECIMALS);
      await mockConvexToken.mock.totalSupply.returns(csvTotalSupply);
    });
    it("should report no loss", async () => {
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("0.5", TOKEN_DECIMALS)]);
      await mockCurveGauge.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(ethers.utils.parseUnits("2", TOKEN_DECIMALS));
      const res = { activation: 0, totalDebt: ethers.utils.parseUnits("2", TOKEN_DECIMALS), lastReport: 0, totalGain: 0, totalLoss: 0 };
      await mockVault.mock.strategy.returns(res);
      await mockCurveGauge.mock.integrate_fraction.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockCurveMinter.mock.minted.returns(ethers.utils.parseUnits("0.5", TOKEN_DECIMALS));
      await mockDex.mock.getAmountsOut.returns([0, 0, ethers.utils.parseUnits("0.5", TOKEN_DECIMALS)]);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      // no profit to report as we can't change the balanceOf what based the number of calls, so it will always be 0
      // no loss here as the debt value (2) is smaller than the estmiated total value (3.5)
      // no debt payment either

      expect(await strategy.testPrepareReturn(ethers.constants.Zero))
        .to.emit(strategy, "ReturnsReported")
        .withArgs(ethers.constants.Zero, ethers.constants.Zero, ethers.constants.Zero);
    });

    it("should report loss", async () => {
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("0.5", TOKEN_DECIMALS)]);
      await mockCurveGauge.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(ethers.utils.parseUnits("2", TOKEN_DECIMALS));
      const res = { activation: 0, totalDebt: ethers.utils.parseUnits("4", TOKEN_DECIMALS), lastReport: 0, totalGain: 0, totalLoss: 0 };
      await mockVault.mock.strategy.returns(res);

      await mockCurveGauge.mock.integrate_fraction.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockCurveMinter.mock.minted.returns(ethers.utils.parseUnits("0.5", TOKEN_DECIMALS));
      await mockDex.mock.getAmountsOut.returns([0, 0, ethers.utils.parseUnits("0.5", TOKEN_DECIMALS)]);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseUnits("0", TOKEN_DECIMALS));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("0", TOKEN_DECIMALS));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      // no profit to report as we can't change the balanceOf what based the number of calls, so it will always be 0
      // there is loss here as the debt value (4) is bigger than the estimated total value (3.5)
      // no debt payment either
      expect(await strategy.testPrepareReturn(ethers.constants.Zero))
        .to.emit(strategy, "ReturnsReported")
        .withArgs(ethers.constants.Zero, ethers.utils.parseUnits("3", TOKEN_DECIMALS), ethers.constants.Zero);
    });

    it("should report debtPayment", async () => {
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("0.5", TOKEN_DECIMALS)]);
      await mockCurveGauge.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(ethers.utils.parseUnits("2", TOKEN_DECIMALS));
      const res = { activation: 0, totalDebt: ethers.utils.parseUnits("4", TOKEN_DECIMALS), lastReport: 0, totalGain: 0, totalLoss: 0 };
      await mockVault.mock.strategy.returns(res);
      await mockCurveGauge.mock.integrate_fraction.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockCurveMinter.mock.minted.returns(ethers.utils.parseUnits("0.5", TOKEN_DECIMALS));
      await mockDex.mock.getAmountsOut.returns([0, 0, ethers.utils.parseUnits("0.5", TOKEN_DECIMALS)]);
      await mockCurvePool.mock["calc_token_amount(uint256[2],bool)"].returns(ethers.utils.parseUnits("0.5", TOKEN_DECIMALS));
      await mockCurveGauge.mock.withdraw.returns();
      await mockCurvePool.mock.remove_liquidity_one_coin.returns(ethers.utils.parseUnits("0.5", TOKEN_DECIMALS));
      await mockDex.mock.getAmountsOut.returns([0, 0, ethers.utils.parseUnits("0.5", TOKEN_DECIMALS)]);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseUnits("0", TOKEN_DECIMALS));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("0", TOKEN_DECIMALS));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      // no profit to report as we can't change the balanceOf what based the number of calls, so it will always be 0
      // there is loss here as the debt value (4) is bigger than the estmiated total value (3.5)
      // debtpayment is 1
      expect(await strategy.testPrepareReturn(ethers.utils.parseUnits("1", TOKEN_DECIMALS)))
        .to.emit(strategy, "ReturnsReported")
        .withArgs(ethers.constants.Zero, ethers.utils.parseUnits("3", TOKEN_DECIMALS), ethers.utils.parseUnits("1", TOKEN_DECIMALS));
    });
  });

  describe("prepareMigration", async () => {
    beforeEach(async () => {
      const csvTotalSupply = ethers.utils.parseUnits("100000", TOKEN_DECIMALS);
      await mockConvexToken.mock.totalSupply.returns(csvTotalSupply);
    });
    it("should success", async () => {
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.transfer.returns(true);
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("1", TOKEN_DECIMALS)]);
      await mockCurveGauge.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockCurveGauge.mock.withdraw.returns();
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockCurvePool.mock.remove_liquidity_one_coin.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await expect(strategy.testPrepareMigration(newStrategy.address)).not.to.be.reverted;
    });
  });

  describe("liquidatePosition", async () => {
    beforeEach(async () => {
      const csvTotalSupply = ethers.utils.parseUnits("100000", TOKEN_DECIMALS);
      await mockConvexToken.mock.totalSupply.returns(csvTotalSupply);
    });
    it("success when withdraw is not needed", async () => {
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("1", TOKEN_DECIMALS)]);
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseUnits("3", TOKEN_DECIMALS));
      // want is less than balance, so no withdraw is needed
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await expect(await strategy.testLiquidatePosition(ethers.utils.parseUnits("2", TOKEN_DECIMALS)))
        .to.emit(strategy, "LiquidationReported")
        .withArgs(ethers.utils.parseUnits("2", TOKEN_DECIMALS), 0);
    });

    it("success when withdraw is needed", async () => {
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("1", TOKEN_DECIMALS)]);
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockCurvePool.mock["calc_token_amount(uint256[2],bool)"].returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockCurveGauge.mock.balanceOf.returns(ethers.utils.parseUnits("0.5", TOKEN_DECIMALS));
      await mockCurveGauge.mock.withdraw.returns();
      await mockCurvePool.mock.remove_liquidity_one_coin.returns(ethers.utils.parseUnits("0.5", TOKEN_DECIMALS));
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      // want is more than balance, so withdraw is needed
      // total liquidated = balance + remove_liquidity_one_coin = 1.5
      // total want = 2
      // loss = 0.5
      await expect(await strategy.testLiquidatePosition(ethers.utils.parseUnits("2", TOKEN_DECIMALS)))
        .to.emit(strategy, "LiquidationReported")
        .withArgs(ethers.utils.parseUnits("1", TOKEN_DECIMALS), ethers.utils.parseUnits("1", TOKEN_DECIMALS));
    });

    it("should success when there is no rewards", async () => {
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.balanceOf.returns(ethers.constants.Zero);
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseUnits("3", TOKEN_DECIMALS));
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("1", TOKEN_DECIMALS)]);
      // await mockConvexToken.mock.approve.returns(true);
      // want is less than balance, so no withdraw is needed
      await expect(await strategy.testLiquidatePosition(ethers.utils.parseUnits("2", TOKEN_DECIMALS)))
        .to.emit(strategy, "LiquidationReported")
        .withArgs(ethers.utils.parseUnits("2", TOKEN_DECIMALS), 0);
    });
  });

  describe("protectedTokens", async () => {
    it("should return the expected protected tokens", async () => {
      const tokens = await strategy.testProtectedTokens();
      expect(tokens).to.deep.equal([curveToken.address, poolLpToken.address]);
    });
  });

  describe("withdrawSome", async () => {
    beforeEach(async () => {
      await mockCurveGauge.mock.balanceOf.returns(0);
      await mockCurveGauge.mock["withdraw(uint256)"].returns();
      await mockVaultToken.mock.balanceOf.returns(0);
      await mockCurvePool.mock.remove_liquidity_one_coin.returns(0);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
    });
    it("should not revert with 2", async () => {
      await strategy.setCoinsCount(2);
      await mockCurvePool.mock["calc_token_amount(uint256[2],bool)"].returns(0);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await expect(strategy.withdrawSome(1000)).not.to.be.reverted;
    });

    it("should not revert with 3", async () => {
      await strategy.setCoinsCount(3);
      await mockCurvePool.mock["calc_token_amount(uint256[3],bool)"].returns(0);
      await expect(strategy.withdrawSome(1000)).not.to.be.reverted;
    });

    it("should not revert with 4", async () => {
      await strategy.setCoinsCount(4);
      await mockCurvePool.mock["calc_token_amount(uint256[4],bool)"].returns(0);
      await expect(strategy.withdrawSome(1000)).not.to.be.reverted;
    });

    it("should revert with more than 4 tokens", async () => {
      await strategy.setCoinsCount(5);
      await expect(strategy.withdrawSome(1000)).to.be.revertedWith("Invalid number of LP tokens");
    });
  });
});
