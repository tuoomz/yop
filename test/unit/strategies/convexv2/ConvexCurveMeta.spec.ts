import { expect } from "chai";
import { ethers, waffle } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ConvexCurveMetaMock } from "../../../../types/ConvexCurveMetaMock";
import { setupMockVault, setupCurve, setupConvex } from "../../fixtures/setup";
import { MockContract } from "ethereum-waffle";
import ERC20ABI from "../../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import CurvePlainPoolTrioABI from "../../../abis/curvePlainPoolTrio.json";
import { ContractFactory } from "ethers";
import { CONST } from "../../../constants";
const { loadFixture, deployMockContract } = waffle;

const USDN_META_POOL_ID_CONVEX = 13;
const convexTotalSupply = ethers.utils.parseEther("100000000");
const NUMBER_OF_POOL_COINS = 3;

describe("ConvexCurveMeta strategy", async () => {
  let mockVault: MockContract;
  let mockVaultToken: MockContract;
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let proposer: SignerWithAddress;
  let developer: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let user: SignerWithAddress;
  let newStrategy: SignerWithAddress;
  let poolLpToken: MockContract;
  let curveToken: MockContract;

  let mockCurvePool: MockContract;
  let mockCurveMetaPool: MockContract;
  let curveMetaPoolLPToken: MockContract;
  let mockDex: MockContract;

  let mockConvexBooster: MockContract;
  let mockConvexRewards: MockContract;
  let mockConvexToken: MockContract;
  let convexCurveMetaStrategy: ConvexCurveMetaMock;
  let strategyFactory: ContractFactory;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, proposer, developer, newStrategy] = await ethers.getSigners();
    ({ mockVault, mockVaultToken } = await loadFixture(setupMockVault));
    user = (await ethers.getSigners()).reverse()[0];
    // don't run another `loadFixture` as it will cause some wired issues with hardhat.
    ({ mockDex, poolLpToken, mockCurvePool, curveToken, mockCurveMetaPool, curveMetaPoolLPToken } = await setupCurve());
    ({ mockConvexBooster, mockConvexRewards, mockConvexToken } = await setupConvex());
    mockCurvePool = await deployMockContract(deployer, CurvePlainPoolTrioABI);
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
    strategyFactory = await ethers.getContractFactory("ConvexCurveMetaMock");
    convexCurveMetaStrategy = (await strategyFactory.deploy(
      mockVault.address,
      proposer.address,
      developer.address,
      gatekeeper.address,
      mockCurvePool.address,
      poolLpToken.address,
      mockCurveMetaPool.address,
      curveMetaPoolLPToken.address,
      1,
      NUMBER_OF_POOL_COINS,
      mockConvexBooster.address,
      USDN_META_POOL_ID_CONVEX
    )) as ConvexCurveMetaMock;
    await convexCurveMetaStrategy.deployed();
    await convexCurveMetaStrategy.setCurveTokenAddress(curveToken.address);
    await convexCurveMetaStrategy.setConvexTokenAddress(mockConvexToken.address);
    await convexCurveMetaStrategy.setDex(mockDex.address);
    await mockConvexToken.mock.totalSupply.returns(convexTotalSupply);
  });

  describe("deploy parameters", async () => {
    it("should revert if booster address is not valid", async () => {
      await expect(
        strategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          mockCurvePool.address,
          poolLpToken.address,
          mockCurveMetaPool.address,
          curveMetaPoolLPToken.address,
          1,
          NUMBER_OF_POOL_COINS,
          ethers.constants.AddressZero,
          USDN_META_POOL_ID_CONVEX
        )
      ).to.be.revertedWith("invalid booster address");
    });
    it("should revert if basePool address is not valid", async () => {
      await expect(
        strategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          ethers.constants.AddressZero,
          poolLpToken.address,
          mockCurveMetaPool.address,
          curveMetaPoolLPToken.address,
          1,
          NUMBER_OF_POOL_COINS,
          mockConvexBooster.address,
          USDN_META_POOL_ID_CONVEX
        )
      ).to.be.revertedWith("!pool");
    });
    it("should revert if metaPool address is not valid", async () => {
      await expect(
        strategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          mockCurvePool.address,
          poolLpToken.address,
          ethers.constants.AddressZero,
          curveMetaPoolLPToken.address,
          1,
          NUMBER_OF_POOL_COINS,
          mockConvexBooster.address,
          USDN_META_POOL_ID_CONVEX
        )
      ).to.be.revertedWith("!metaPool");
    });
    it("should revert if number of pool tokens are not valid", async () => {
      await expect(
        strategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          mockCurvePool.address,
          poolLpToken.address,
          mockCurveMetaPool.address,
          curveMetaPoolLPToken.address,
          1,
          5,
          mockConvexBooster.address,
          USDN_META_POOL_ID_CONVEX
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
          poolLpToken.address,
          mockCurveMetaPool.address,
          curveMetaPoolLPToken.address,
          5,
          3,
          mockConvexBooster.address,
          USDN_META_POOL_ID_CONVEX
        )
      ).to.be.revertedWith("!wantIndex");
    });
    it("should revert if poolLpToken address is not valid", async () => {
      await expect(
        strategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          mockCurvePool.address,
          ethers.constants.AddressZero,
          mockCurveMetaPool.address,
          curveMetaPoolLPToken.address,
          1,
          3,
          mockConvexBooster.address,
          USDN_META_POOL_ID_CONVEX
        )
      ).to.be.revertedWith("!token");
    });
  });

  describe("name", async () => {
    it("should return expected name", async () => {
      expect(await convexCurveMetaStrategy.name()).to.equal("ConvexCurveMeta");
    });
  });

  describe("switchDex", async () => {
    it("should fail if user is not authorised", async () => {
      await expect(convexCurveMetaStrategy.connect(user).switchDex(true)).to.be.revertedWith("!authorized");
    });
    it("should change dex", async () => {
      expect(await convexCurveMetaStrategy.dex()).to.equal(mockDex.address);
      await convexCurveMetaStrategy.connect(governance).switchDex(true);
      expect(await convexCurveMetaStrategy.dex()).to.equal(CONST.UNISWAP_DEX_ADDRESS);
      await convexCurveMetaStrategy.connect(governance).switchDex(false);
      expect(await convexCurveMetaStrategy.dex()).to.equal(CONST.SUSHISWAP_DEX_ADDRESS);
      // this will fail if the strategy asks for token approval for the same dex again
      await curveToken.mock.allowance.returns(1000);
      await convexCurveMetaStrategy.connect(governance).switchDex(true);
      expect(await convexCurveMetaStrategy.dex()).to.equal(CONST.UNISWAP_DEX_ADDRESS);
    });
  });

  describe("estimatedTotalAssets", async () => {
    it("should return the correct asset value", async () => {
      const tokenAmount = ethers.utils.parseUnits("100", CONST.TOKENS.USDC.DECIMALS);
      const exchangeAmountOut = ethers.utils.parseUnits("11", CONST.TOKENS.USDC.DECIMALS);
      const withdrawAmountOut = ethers.utils.parseUnits("5", CONST.TOKENS.USDC.DECIMALS);
      const cvxEarned = ethers.utils.parseUnits("17", CONST.TOKENS.USDC.DECIMALS);
      const cvxBalance = ethers.utils.parseUnits("11", CONST.TOKENS.USDC.DECIMALS);
      const cvxTotalSupply = ethers.utils.parseUnits("100000", CONST.TOKENS.CVX.DECIMALS);

      await mockVaultToken.mock.balanceOf.returns(tokenAmount);
      await mockConvexToken.mock.totalSupply.returns(cvxTotalSupply);

      await mockDex.mock.getAmountsOut.returns([0, 0, exchangeAmountOut]);
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurveMetaPool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockConvexRewards.mock.earned.returns(cvxEarned);
      await mockConvexRewards.mock.balanceOf.returns(cvxBalance);

      const expectedTotal = tokenAmount.add(exchangeAmountOut).add(withdrawAmountOut).add(cvxBalance);
      const got = await convexCurveMetaStrategy.estimatedTotalAssets();

      expect(expectedTotal).to.equal(got);
    });

    it("no rewards", async () => {
      const tokenAmount = ethers.utils.parseEther("100");
      const crvAmount = ethers.utils.parseEther("20");
      const withdrawAmountOut = ethers.utils.parseEther("5");
      const cvxEarned = ethers.utils.parseUnits("0", CONST.TOKENS.CVX.DECIMALS);
      const cvxBalance = ethers.utils.parseUnits("5", CONST.TOKENS.CVX.DECIMALS);
      await mockVaultToken.mock.balanceOf.returns(tokenAmount);
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurveMetaPool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockConvexRewards.mock.earned.returns(cvxEarned);
      await mockConvexRewards.mock.balanceOf.returns(cvxBalance);
      const expectedTotal = tokenAmount.add(withdrawAmountOut);
      const got = await convexCurveMetaStrategy.estimatedTotalAssets();
      expect(expectedTotal).to.equal(got);
    });
  });

  describe("approveAll", async () => {
    it("should revert if the user is not authorised", async () => {
      await expect(convexCurveMetaStrategy.approveAll()).to.be.revertedWith("!authorized");
    });
    it("should approve on required tokens", async () => {
      await convexCurveMetaStrategy.connect(developer).approveAll();
    });
  });

  describe("adjustPosition", async () => {
    beforeEach(async () => {
      await mockConvexRewards.mock.getReward.returns(0);
      await curveToken.mock.balanceOf.returns(0);
      await mockConvexToken.mock.balanceOf.returns(0);
    });

    it("should success when balance is not 0", async () => {
      const balance = ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS);
      await mockVault.mock.debtOutstanding.returns(0);
      await mockCurvePool.mock["add_liquidity(uint256[3],uint256)"].returns();
      await mockVaultToken.mock.balanceOf.returns(balance);
      await poolLpToken.mock.balanceOf.returns(balance);
      await mockCurveMetaPool.mock.add_liquidity.returns(1);
      await mockConvexBooster.mock.depositAll.returns(true);

      convexCurveMetaStrategy.connect(developer).tend();

      await expect(convexCurveMetaStrategy.connect(developer).tend()).not.to.be.reverted;
    });

    it("should success when balance is 0", async () => {
      const balance = ethers.constants.Zero;
      await mockVault.mock.debtOutstanding.returns(0);
      await mockVaultToken.mock.balanceOf.returns(balance);
      await poolLpToken.mock.balanceOf.returns(balance);
      await mockConvexBooster.mock.depositAll.returns(true);

      convexCurveMetaStrategy.connect(developer).tend();

      await expect(convexCurveMetaStrategy.connect(developer).tend()).not.to.be.reverted;
    });

    it("should not do anything if emergency exit", async () => {
      await mockVault.mock.revokeStrategy.returns();
      await mockConvexRewards.mock.getReward.returns(0);
      await curveToken.mock.balanceOf.returns(0);
      await mockVault.mock.debtOutstanding.returns(0);
      await convexCurveMetaStrategy.connect(governance).setEmergencyExit();
      await expect(convexCurveMetaStrategy.connect(developer).tend()).not.to.be.reverted;
    });
  });

  describe("prepareReturn", async () => {
    it("should report no loss", async () => {
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS));
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("0.5", CONST.TOKENS.USDC.DECIMALS)]);
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(ethers.utils.parseUnits("2", CONST.TOKENS.USDC.DECIMALS));
      await mockCurveMetaPool.mock.calc_withdraw_one_coin.returns(0);
      const res = {
        activation: 0,
        totalDebt: ethers.utils.parseUnits("2", CONST.TOKENS.USDC.DECIMALS),
        lastReport: 0,
        totalGain: 0,
        totalLoss: 0,
      };
      await mockVault.mock.strategy.returns(res);
      await mockDex.mock.getAmountsOut.returns([0, 0, ethers.utils.parseUnits("0.5", CONST.TOKENS.USDC.DECIMALS)]);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS));
      // no profit to report as we can't change the balanceOf what based the number of calls, so it will always be 0
      // no loss here as the debt value (2) is smaller than the estmiated total value (3.5)
      // no debt payment either

      expect(await convexCurveMetaStrategy.testPrepareReturn(ethers.constants.Zero))
        .to.emit(convexCurveMetaStrategy, "ReturnsReported")
        .withArgs(ethers.constants.Zero, ethers.constants.Zero, ethers.constants.Zero);
    });

    it("should report loss", async () => {
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS));
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("0.5", CONST.TOKENS.USDC.DECIMALS)]);
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(ethers.utils.parseUnits("2", CONST.TOKENS.USDC.DECIMALS));
      const res = {
        activation: 0,
        totalDebt: ethers.utils.parseUnits("4", CONST.TOKENS.USDC.DECIMALS),
        lastReport: 0,
        totalGain: 0,
        totalLoss: 0,
      };
      await mockVault.mock.strategy.returns(res);

      await mockDex.mock.getAmountsOut.returns([0, 0, ethers.utils.parseUnits("0.5", CONST.TOKENS.USDC.DECIMALS)]);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseUnits("0", CONST.TOKENS.USDC.DECIMALS));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("0", CONST.TOKENS.USDC.DECIMALS));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS));
      // no profit to report as we can't change the balanceOf what based the number of calls, so it will always be 0
      // there is loss here as the debt value (4) is bigger than the estimated total value (3.5)
      // no debt payment either
      expect(await convexCurveMetaStrategy.testPrepareReturn(ethers.constants.Zero))
        .to.emit(convexCurveMetaStrategy, "ReturnsReported")
        .withArgs(ethers.constants.Zero, ethers.utils.parseUnits("3", CONST.TOKENS.USDC.DECIMALS), ethers.constants.Zero);
    });

    it("should report debtPayment", async () => {
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS));
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("0.5", CONST.TOKENS.USDC.DECIMALS)]);
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(ethers.utils.parseUnits("2", CONST.TOKENS.USDC.DECIMALS));
      const res = {
        activation: 0,
        totalDebt: ethers.utils.parseUnits("4", CONST.TOKENS.USDC.DECIMALS),
        lastReport: 0,
        totalGain: 0,
        totalLoss: 0,
      };
      await mockVault.mock.strategy.returns(res);
      await mockDex.mock.getAmountsOut.returns([0, 0, ethers.utils.parseUnits("0.5", CONST.TOKENS.USDC.DECIMALS)]);
      await mockCurvePool.mock.calc_token_amount.returns(0);
      await poolLpToken.mock.balanceOf.returns(0);
      await mockCurveMetaPool.mock["calc_token_amount(uint256[2],bool)"].returns(0);
      await curveMetaPoolLPToken.mock.balanceOf.returns(0);
      await mockCurvePool.mock.remove_liquidity_one_coin.returns();
      await mockCurveMetaPool.mock.remove_liquidity_one_coin.returns(1);
      await mockDex.mock.getAmountsOut.returns([0, 0, ethers.utils.parseUnits("0.5", CONST.TOKENS.USDC.DECIMALS)]);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseUnits("0", CONST.TOKENS.CVX.DECIMALS));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("0", CONST.TOKENS.CVX.DECIMALS));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.CVX.DECIMALS));
      // no profit to report as we can't change the balanceOf what based the number of calls, so it will always be 0
      // there is loss here as the debt value (4) is bigger than the estmiated total value (3.5)
      // debtpayment is 1
      expect(await convexCurveMetaStrategy.testPrepareReturn(ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS)))
        .to.emit(convexCurveMetaStrategy, "ReturnsReported")
        .withArgs(
          ethers.constants.Zero,
          ethers.utils.parseUnits("3", CONST.TOKENS.USDC.DECIMALS),
          ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS)
        );
    });
  });

  describe("prepareMigration", async () => {
    it("should success", async () => {
      await curveToken.mock.transfer.returns(true);
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS));
      await curveMetaPoolLPToken.mock.balanceOf.returns(0);
      await poolLpToken.mock.balanceOf.returns(0);
      await mockCurveMetaPool.mock.remove_liquidity_one_coin.returns(1);
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS)]);
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS));
      await mockCurvePool.mock.remove_liquidity_one_coin.returns();
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseUnits("1", CONST.TOKENS.CVX.DECIMALS));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.CVX.DECIMALS));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.CVX.DECIMALS));
      await expect(convexCurveMetaStrategy.testPrepareMigration(newStrategy.address)).not.to.be.reverted;
    });
  });

  describe("liquidatePosition", async () => {
    it("success when withdraw is not needed", async () => {
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS)]);
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseUnits("3", CONST.TOKENS.USDC.DECIMALS));
      // want is less than balance, so no withdraw is needed
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseUnits("1", CONST.TOKENS.CVX.DECIMALS));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.CVX.DECIMALS));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.CVX.DECIMALS));
      await expect(await convexCurveMetaStrategy.testLiquidatePosition(ethers.utils.parseUnits("2", CONST.TOKENS.USDC.DECIMALS)))
        .to.emit(convexCurveMetaStrategy, "LiquidationReported")
        .withArgs(ethers.utils.parseUnits("2", CONST.TOKENS.USDC.DECIMALS), 0);
    });

    it("success when withdraw is needed", async () => {
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.CRV.DECIMALS));
      await curveMetaPoolLPToken.mock.balanceOf.returns(0);
      await mockCurveMetaPool.mock.remove_liquidity_one_coin.returns(1);
      await poolLpToken.mock.balanceOf.returns(0);
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS)]);
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS));
      await mockCurvePool.mock["calc_token_amount(uint256[3],bool)"].returns(ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS));
      await mockCurveMetaPool.mock["calc_token_amount(uint256[2],bool)"].returns(0);
      await mockCurvePool.mock.remove_liquidity_one_coin.returns();
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseUnits("1", CONST.TOKENS.CVX.DECIMALS));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.CVX.DECIMALS));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.CVX.DECIMALS));
      // want is more than balance, so withdraw is needed
      // total liquidated = balance + remove_liquidity_one_coin = 1.5
      // total want = 2
      // loss = 0.5
      await expect(await convexCurveMetaStrategy.testLiquidatePosition(ethers.utils.parseUnits("2", CONST.TOKENS.USDC.DECIMALS)))
        .to.emit(convexCurveMetaStrategy, "LiquidationReported")
        .withArgs(ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS), ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS));
    });

    it("should success when there is rewards", async () => {
      await curveToken.mock.balanceOf.returns(ethers.constants.Zero);
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseUnits("3", CONST.TOKENS.USDC.DECIMALS));
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseUnits("1", CONST.TOKENS.CVX.DECIMALS));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.CVX.DECIMALS));
      await mockConvexToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.CVX.DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("1", CONST.TOKENS.USDC.DECIMALS)]);
      // want is less than balance, so no withdraw is needed
      await expect(await convexCurveMetaStrategy.testLiquidatePosition(ethers.utils.parseUnits("2", CONST.TOKENS.USDC.DECIMALS)))
        .to.emit(convexCurveMetaStrategy, "LiquidationReported")
        .withArgs(ethers.utils.parseUnits("2", CONST.TOKENS.USDC.DECIMALS), 0);
    });
  });

  describe("protectedTokens", async () => {
    it("should return the expected protected tokens", async () => {
      const tokens = await convexCurveMetaStrategy.testProtectedTokens();
      expect(tokens).to.deep.equal([curveToken.address, mockConvexToken.address, poolLpToken.address, curveMetaPoolLPToken.address]);
    });
  });

  describe("approveDex", async () => {
    it("should approve the dex", async () => {
      await expect(convexCurveMetaStrategy.testApproveDex()).not.to.be.reverted;
    });
  });

  describe("withdrawSome", async () => {
    beforeEach(async () => {
      await mockVaultToken.mock.balanceOf.returns(0);
      await mockCurvePool.mock.remove_liquidity_one_coin.returns();
      await mockConvexRewards.mock.getReward.returns(true);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(true);
      await mockConvexRewards.mock.earned.returns(ethers.utils.parseUnits("1", CONST.TOKENS.CVX.DECIMALS));
      await mockConvexRewards.mock.balanceOf.returns(ethers.utils.parseUnits("1", CONST.TOKENS.CVX.DECIMALS));
    });

    it("should not revert", async () => {
      await convexCurveMetaStrategy.setCoinsCount(3);
      await mockCurvePool.mock.calc_token_amount.returns(0);
      await poolLpToken.mock.balanceOf.returns(0);
      await mockCurveMetaPool.mock["calc_token_amount(uint256[2],bool)"].returns(0);
      await curveMetaPoolLPToken.mock.balanceOf.returns(0);
      await mockCurveMetaPool.mock.remove_liquidity_one_coin.returns(1);
      await expect(convexCurveMetaStrategy.withdrawSome(1000)).not.to.be.reverted;
    });

    it("should revert with more than 4 tokens", async () => {
      await convexCurveMetaStrategy.setCoinsCount(5);
      await expect(convexCurveMetaStrategy.withdrawSome(1000)).to.be.revertedWith("Invalid number of LP tokens");
    });
  });
  describe("onHarvest()", async () => {
    it("should not revert when calling onHarvest", async () => {
      await expect(convexCurveMetaStrategy.mockOnHarvest()).not.to.be.reverted;
    });
  });
});
