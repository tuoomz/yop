import { FakeContract, smock } from "@defi-wonderland/smock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai, { expect } from "chai";
import { MockContract } from "ethereum-waffle";
import { ContractFactory } from "ethers";
import { ethers, waffle } from "hardhat";
import ERC20ABI from "../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import { ConvexBtcStrategyMock, IConvexDeposit, TokenMock } from "../../../types";
import convexRewardsABI from "../../abis/convexBaseRewards.json";
import CurveZapDepositorABI from "../../abis/curvePoolZapDepositor.json";
import dexABI from "../../abis/sushiSwapRouter.json";
import { CONST } from "../../constants";
import { setupMockVault } from "../fixtures/setup";

const { loadFixture, deployMockContract } = waffle;
chai.use(smock.matchers);

const WBTC_DECIMALS = 8;

describe("ConvexBtc strategy", async () => {
  let mockVault: MockContract;
  let mockVaultToken: MockContract;

  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let governance: SignerWithAddress;
  let proposer: SignerWithAddress;
  let developer: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let rewards: SignerWithAddress;

  let poolLpToken: MockContract;
  let curveToken: MockContract;
  let convexToken: MockContract;

  let mockCurvePool: MockContract;

  let mockConvexBooster: FakeContract<IConvexDeposit>;
  let mockConvexRewards: MockContract;

  let mockDex: MockContract;
  let convexBTCStrategyFactory: ContractFactory;

  let convexBtcStrategy: ConvexBtcStrategyMock;

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
    mockConvexBooster = await smock.fake("IConvexDeposit");
    mockConvexRewards = await deployMockContract(deployer, convexRewardsABI);

    convexBTCStrategyFactory = await ethers.getContractFactory("ConvexBtcStrategyMock");
    await mockConvexBooster.poolInfo.returns([
      poolLpToken.address,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      mockConvexRewards.address,
      mockConvexBooster.address,
      false,
    ]);
    convexBtcStrategy = (await convexBTCStrategyFactory.deploy(
      mockVault.address,
      proposer.address,
      developer.address,
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
    it("should return the correct convex token", async () => {
      await expect(await convexBtcStrategy.name()).to.be.equal("ConvexBTC");
    });
    it("should return the correct convex token address", async () => {
      expect(await convexBtcStrategy.mockGetConvexTokenAddress()).to.be.equal(CONST.CONVEX_TOKEN_ADDRESS);
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
      await mockConvexBooster.depositAll.returns(true);
      await mockVaultToken.mock.approve.returns(true);
      await poolLpToken.mock.balanceOf.returns(tokenAmount);
    });

    it("should deposit to convex", async () => {
      await convexBtcStrategy.mockDepositToConvex();
      expect(mockConvexBooster.depositAll).to.have.callCount(1);
    });

    it("should not deposit when balance is 0", async () => {
      await poolLpToken.mock.balanceOf.returns(0);
      await convexBtcStrategy.mockDepositToConvex();
      expect(mockConvexBooster.depositAll).to.have.callCount(0);
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
      await convexToken.mock.allowance.returns(1000);
      // this will fail if the token approval is called again
      await expect(convexBtcStrategy.testApproveDex()).not.to.be.reverted;
    });
  });

  describe("_convexRewardsValue", async () => {
    it("should not mint more crv than total supply", async () => {
      const totalSupply = ethers.utils.parseEther("99999999");
      const earned = ethers.utils.parseEther("100000000000000000");
      await convexToken.mock.totalSupply.returns(totalSupply);
      await mockConvexRewards.mock.earned.returns(earned);
      expect(await convexBtcStrategy.mockConvexRewardsValue(convexToken.address)).to.be.equal(ethers.utils.parseEther("100000000000000001"));
    });
    it("cliff > total cliff", async () => {
      const totalSupply = ethers.utils.parseEther("100000000");
      const earned = ethers.utils.parseEther("100000000000000000");
      await convexToken.mock.totalSupply.returns(totalSupply);
      await mockConvexRewards.mock.earned.returns(earned);
      expect(await convexBtcStrategy.mockConvexRewardsValue(convexToken.address)).to.be.equal(earned);
    });
  });
  describe("invalid address", async () => {
    it("should fail when passing invalid booster address", async () => {
      await expect(
        convexBTCStrategyFactory.deploy(
          mockVault.address,
          proposer.address,
          developer.address,
          gatekeeper.address,
          mockCurvePool.address,
          ethers.constants.AddressZero
        )
      ).to.be.revertedWith("invalid booster address");
    });
  });
});
