import chai, { expect } from "chai";
import { ethers, waffle, network } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { SingleAssetVault, ConvexEthStrategyMock, TokenMock, VaultStrategyDataStore } from "../../../types";
import { MockContract } from "ethereum-waffle";
import { setupConvexMocks, setupMockVault, setupCurve } from "../fixtures/setup";
import CurveZapDepositorABI from "../../abis/curvePoolZapDepositor.json";
import curvePoolABI from "../../abis/curvePlainPool.json";
import ERC20ABI from "../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import dexABI from "../../abis/sushiSwapRouter.json";
import convexBoosterABI from "../../abis/convexBooster.json";
import convexRewardsABI from "../../abis/convexBaseRewards.json";
import IWethABI from "../../../abi/contracts/interfaces/IWeth.sol/IWETH.json";

const { loadFixture, deployMockContract } = waffle;

const WETH_DECIMALS = 8;

describe("ConvexEth strategy", async () => {
  let mockVault: MockContract;
  let mockVaultToken: MockContract;

  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let governance: SignerWithAddress;
  let proposer: SignerWithAddress;
  let developer: SignerWithAddress;
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

  let convexEthStrategy: ConvexEthStrategyMock;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, rewards, proposer, developer] = await ethers.getSigners();
    ({ mockVault } = await loadFixture(setupMockVault));
    user = (await ethers.getSigners()).reverse()[0];
    // don't run another `loadFixture` as it will cause some wired issues with hardhat.
    poolLpToken = await deployMockContract(deployer, ERC20ABI);
    curveToken = await deployMockContract(deployer, ERC20ABI);
    convexToken = await deployMockContract(deployer, ERC20ABI);
    mockCurvePool = await deployMockContract(deployer, CurveZapDepositorABI);
    mockDex = await deployMockContract(deployer, dexABI);
    mockVaultToken = await deployMockContract(deployer, IWethABI);
    await mockVault.mock.token.returns(mockVaultToken.address);
    await mockVault.mock.approve.returns(true);
    await mockVault.mock.governance.returns(governance.address);
    await mockVault.mock.gatekeeper.returns(gatekeeper.address);
    await mockVaultToken.mock.allowance.returns(0);
    await mockVaultToken.mock.approve.returns(true);
    await poolLpToken.mock.approve.returns(true);
    await poolLpToken.mock.allowance.returns(0);
    mockConvexBooster = await deployMockContract(deployer, convexBoosterABI);
    mockConvexRewards = await deployMockContract(deployer, convexRewardsABI);

    const ConvexEthStrategyFactory = await ethers.getContractFactory("ConvexEthStrategyMock");
    await mockConvexBooster.mock.poolInfo.returns(
      poolLpToken.address,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      mockConvexRewards.address,
      ethers.constants.AddressZero,
      false
    );
    convexEthStrategy = (await ConvexEthStrategyFactory.deploy(
      mockVault.address,
      proposer.address,
      developer.address,
      gatekeeper.address,
      mockCurvePool.address,
      mockConvexBooster.address
    )) as ConvexEthStrategyMock;
    await convexEthStrategy.deployed();
    // await convexEthStrategy.setCurveAddressProvider(mockCurveAddressProvider.address);
    await convexEthStrategy.setConvexTokenAddress(convexToken.address);
    await convexEthStrategy.setCurvePool(mockCurvePool.address);
    await convexEthStrategy.setDex(mockDex.address);
    await convexEthStrategy.setCurveTokenAddress(curveToken.address);
    await convexEthStrategy.setLpToken(poolLpToken.address);
    await convexEthStrategy.setWETHTokenAddress(mockVaultToken.address);
  });

  describe("basics", async () => {
    it("should return the correct name", async () => {
      await expect(await convexEthStrategy.name()).to.be.equal("ConvexETH");
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
      mockVaultToken.mock.balanceOf.returns(tokenAmount);
      await mockDex.mock.getAmountsOut.returns([0, 0, exchangeAmountOut]);
      await convexToken.mock.totalSupply.returns(totalSupply);
      await mockConvexRewards.mock.earned.returns(cvxEarned);
      await mockConvexRewards.mock.balanceOf.returns(cvxBalance);
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      // await mockCurveMetaPool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
    });

    it("should return the correct asset value", async () => {
      const expectedTotal = tokenAmount.add(withdrawAmountOut); // .add(cvxEarned);
      const got = await convexEthStrategy.estimatedTotalAssets();
      expect(expectedTotal).to.equal(got);
    });
  });

  describe("protectedTokens", async () => {
    it("should return the expected protected tokens", async () => {
      const tokens = await convexEthStrategy.mockProtectedTokens();
      const expected = [
        await convexEthStrategy.curveTokenAddress(),
        await convexEthStrategy.getConvexTokenAddress(),
        await convexEthStrategy.lpToken(),
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
      await expect(convexEthStrategy.mockDepositToConvex()).not.to.be.reverted;
    });
  });

  describe("claimRewards", async () => {
    const tokenAmount = ethers.utils.parseEther("10");
    beforeEach(async () => {
      await mockConvexRewards.mock.getReward.returns(true);
      await curveToken.mock.balanceOf.returns(tokenAmount);
      await convexToken.mock.balanceOf.returns(tokenAmount);
      await mockConvexRewards.mock.getReward.returns(true);
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("0.5", WETH_DECIMALS)]);
    });

    it("should not revert when claiming rewards", async () => {
      await expect(convexEthStrategy.mockClaimRewards()).not.to.be.reverted;
    });
  });

  describe("_removeAllLiquidity", async () => {
    const tokenAmount = ethers.utils.parseEther("10");
    const exchangeAmountOut = ethers.utils.parseEther("10");
    const withdrawAmountOut = ethers.utils.parseEther("5");
    const metaLpBalance = ethers.utils.parseEther("2");

    beforeEach(async () => {
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      await mockCurvePool.mock.remove_liquidity_one_coin.returns(exchangeAmountOut);
      await mockCurvePool.mock.calc_token_amount.returns(ethers.utils.parseEther("1"));
      await mockConvexRewards.mock.withdrawAndUnwrap.returns(0);
      await mockConvexRewards.mock.balanceOf.returns(0);
      await mockConvexRewards.mock.earned.returns(0);
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await network.provider.send("hardhat_setBalance", [convexEthStrategy.address, ethers.utils.parseEther("10").toHexString()]);
      await mockVaultToken.mock.deposit.returns();
    });

    it("should not revert when calling removeAllLiquidity", async () => {
      await expect(await convexEthStrategy.mockRemoveAllLiquidity());
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
      await expect(convexEthStrategy.testApproveDex()).not.to.be.reverted;
    });
  });

  describe("onHarvest()", async () => {
    it("should not do anything", async () => {
      await expect(convexEthStrategy.mockOnHarvest()).not.to.be.reverted;
    });
  });
});
