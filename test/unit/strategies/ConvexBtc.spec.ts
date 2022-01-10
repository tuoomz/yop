import chai, { expect } from "chai";
import { ethers, waffle } from "hardhat";
import { solidity, MockContract } from "ethereum-waffle";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { SingleAssetVault, ConvexBtcStrategyMock, TokenMock, VaultStrategyDataStore } from "../../../types";
import { setupConvexMocks, setupMockVault, setupCurve } from "../fixtures/setup";
import CurveZapDepositorABI from "../../abis/curvePoolZapDepositor.json";
import curvePoolABI from "../../abis/curvePlainPool.json";
import ERC20ABI from "../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import dexABI from "../../abis/sushiSwapRouter.json";
import convexBoosterABI from "../../abis/convexBooster.json";
import convexRewardsABI from "../../abis/convexBaseRewards.json";

const { loadFixture, deployMockContract } = waffle;
chai.use(solidity);

const WBTC_DECIMALS = 8;

describe("ConvexBtc strategy", async () => {
  let mockVault: MockContract;
  let mockVaultToken: MockContract;

  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let governance: SignerWithAddress;
  let strategist: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let rewards: SignerWithAddress;
  let manager: SignerWithAddress;

  let mockMetaPoolLpToken: TokenMock;
  let poolLpToken: MockContract;
  let curveToken: MockContract;
  let convexToken: MockContract;

  let mockDai: MockContract;
  let mockUsdc: MockContract;
  let mockUsdt: MockContract;

  let mockCurvePool: MockContract;
  let mockCurveMetaPool: MockContract;
  let mockCurveGauge: MockContract;
  let mockCurveMinter: MockContract;
  let mockCurveRegistry: MockContract;
  let mockConvexBooster: MockContract;
  let mockConvexRewards: MockContract;
  let mockCurveAddressProvider: MockContract;
  let mockDex: MockContract;

  let convexBtcStrategy: ConvexBtcStrategyMock;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, rewards, strategist] = await ethers.getSigners();
    ({ mockVault } = await loadFixture(setupMockVault));
    user = (await ethers.getSigners()).reverse()[0];
    // don't run another `loadFixture` as it will cause some wired issues with hardhat.
    poolLpToken = await deployMockContract(deployer, ERC20ABI);
    curveToken = await deployMockContract(deployer, ERC20ABI);
    convexToken = await deployMockContract(deployer, ERC20ABI);
    mockCurvePool = await deployMockContract(deployer, CurveZapDepositorABI);
    mockDex = await deployMockContract(deployer, dexABI);
    mockVaultToken = await deployMockContract(deployer, ERC20ABI);
    await mockVault.mock.token.returns(mockVaultToken.address);
    await mockVault.mock.approve.returns(true);
    await mockVault.mock.governance.returns(governance.address);
    await mockVault.mock.gatekeeper.returns(gatekeeper.address);
    await mockVaultToken.mock.allowance.returns(0);
    await mockVaultToken.mock.approve.returns(true);
    await mockVaultToken.mock.approve.returns(true);
    await poolLpToken.mock.approve.returns(true);
    await poolLpToken.mock.allowance.returns(0);
    mockConvexBooster = await deployMockContract(deployer, convexBoosterABI);
    mockConvexRewards = await deployMockContract(deployer, convexRewardsABI);

    const ConvexBTCStrategyFactory = await ethers.getContractFactory("ConvexBtcStrategyMock");
    await mockConvexBooster.mock.poolInfo.returns(
      poolLpToken.address,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      mockConvexRewards.address,
      ethers.constants.AddressZero,
      false
    );
    convexBtcStrategy = (await ConvexBTCStrategyFactory.deploy(
      mockVault.address,
      strategist.address,
      rewards.address,
      gatekeeper.address,
      mockCurvePool.address,
      mockConvexBooster.address
    )) as ConvexBtcStrategyMock;
    await convexBtcStrategy.deployed();
    // await convexBtcStrategy.setCurveAddressProvider(mockCurveAddressProvider.address);
    await convexBtcStrategy.setConvexTokenAddress(convexToken.address);
    await convexBtcStrategy.setCurvePool(mockCurvePool.address);
    await convexBtcStrategy.setDex(mockDex.address);
    await convexBtcStrategy.setCurveTokenAddress(curveToken.address);
    await convexBtcStrategy.setLpToken(poolLpToken.address);
    await convexBtcStrategy.setWBTCTokenAddress(mockVaultToken.address);
  });

  describe("basics", async () => {
    it("should return the correct name", async () => {
      await expect(await convexBtcStrategy.name()).to.be.equal("ConvexBTC");
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
      await mockVaultToken.mock.balanceOf.returns(tokenAmount);
      await mockDex.mock.getAmountsOut.returns([0, 0, exchangeAmountOut]);
      await convexToken.mock.totalSupply.returns(totalSupply);
      await mockConvexRewards.mock.earned.returns(cvxEarned);
      await mockConvexRewards.mock.balanceOf.returns(cvxBalance);
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      // await mockCurveMetaPool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
    });

    it("should return the correct asset value", async () => {
      const expectedTotal = tokenAmount.add(exchangeAmountOut).add(withdrawAmountOut).add(cvxBalance);
      const got = await convexBtcStrategy.estimatedTotalAssets();
      expect(expectedTotal).to.equal(got);
    });
  });

  describe("protectedTokens", async () => {
    it("should return the expected protected tokens", async () => {
      const tokens = await convexBtcStrategy.mockProtectedTokens();
      const expected = [
        await convexBtcStrategy.curveTokenAddress(),
        await convexBtcStrategy.convexTokenAddress(),
        await convexBtcStrategy.lpToken(),
      ];
      expect(tokens).to.deep.equal(expected);
    });
  });

  describe("depositToConvex", async () => {
    const tokenAmount = ethers.utils.parseEther("10");
    beforeEach(async () => {
      await mockConvexBooster.mock.depositAll.returns(true);
      await mockVaultToken.mock.approve.returns(true);
      await poolLpToken.mock.balanceOf.returns(tokenAmount);
    });

    it("should deposit to convex", async () => {
      await convexBtcStrategy.mockDepositToConvex();
      // await expect(convexBtcStrategy.mockDepositToConvex()).not.to.be.reverted;
    });
  });

  describe("claimRewards", async () => {
    const tokenAmount = ethers.utils.parseEther("10");
    beforeEach(async () => {
      await mockConvexRewards.mock.getReward.returns(true);
      await curveToken.mock.balanceOf.returns(tokenAmount);
      await convexToken.mock.balanceOf.returns(tokenAmount);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("0.5", WBTC_DECIMALS)]);
    });

    it("should not revert when claiming rewards", async () => {
      await convexBtcStrategy.mockClaimRewards();
      // await expect(convexBtcStrategy.mockClaimRewards()).not.to.be.reverted;
    });
  });

  describe("_removeAllLiquidity", async () => {
    const tokenAmount = ethers.utils.parseEther("10");
    const exchangeAmountOut = ethers.utils.parseEther("10");
    const withdrawAmountOut = ethers.utils.parseEther("5");
    const metaLpBalance = ethers.utils.parseEther("2");

    beforeEach(async () => {
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurvePool.mock.remove_liquidity_one_coin.returns(1);
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(0);
      await mockConvexRewards.mock.balanceOf.returns(0);
      await mockConvexRewards.mock.earned.returns(0);
      await mockVaultToken.mock.balanceOf.returns(0);
    });

    it("should not revert when calling removeAllLiquidity", async () => {
      await expect(await convexBtcStrategy.mockRemoveAllLiquidity());
    });
  });

  describe("onHarvest()", async () => {
    it("should not revert when calling onHarvest", async () => {
      await expect(convexBtcStrategy.mockOnHarvest()).not.to.be.reverted;
    });
  });

  describe("approveDex", async () => {
    const tokenAmount = ethers.utils.parseEther("10");
    beforeEach(async () => {
      await curveToken.mock.approve.returns(true);
      await curveToken.mock.allowance.returns(0);
      await convexToken.mock.approve.returns(true);
      await convexToken.mock.allowance.returns(0);
    });

    it("should approve the dex", async () => {
      await expect(convexBtcStrategy.testApproveDex()).not.to.be.reverted;
    });
  });
});
