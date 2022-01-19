import { expect } from "chai";
import { ethers, waffle, network } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { CurveEthStrategyMock } from "../../../types/CurveEthStrategyMock";
import { setupMockVault, setupCurve } from "../fixtures/setup";
import { MockContract } from "ethereum-waffle";
import IWethABI from "../../../abi/contracts/interfaces/IWeth.sol/IWETH.json";
const { loadFixture, deployMockContract } = waffle;

describe("CurveEth strategy", async () => {
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
  let mockCurveRegistry: MockContract;
  let mockCurveMinter: MockContract;
  let mockCurveAddressProvider: MockContract;
  let mockDex: MockContract;

  let curveEthStrategy: CurveEthStrategyMock;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, rewards, proposer, developer, newStrategy] = await ethers.getSigners();
    ({ mockVault } = await loadFixture(setupMockVault));
    // don't run another `loadFixture` as it will cause some wired issues with hardhat.
    ({ mockCurveAddressProvider, mockCurveMinter, mockCurvePool, mockCurveGauge, mockCurveRegistry, mockDex, poolLpToken, curveToken } =
      await setupCurve());
    mockVaultToken = await deployMockContract(deployer, IWethABI);
    await mockVault.mock.token.returns(mockVaultToken.address);
    await mockVault.mock.approve.returns(true);
    await mockVault.mock.governance.returns(governance.address);
    await mockVault.mock.gatekeeper.returns(gatekeeper.address);
    await mockVaultToken.mock.allowance.returns(0);
    await mockVaultToken.mock.approve.returns(true);
    const CurveEthStrategyFactory = await ethers.getContractFactory("CurveEthStrategyMock");
    curveEthStrategy = (await CurveEthStrategyFactory.deploy(
      mockVault.address,
      proposer.address,
      developer.address,
      gatekeeper.address,
      mockCurvePool.address
    )) as CurveEthStrategyMock;
    await curveEthStrategy.deployed();
    await curveEthStrategy.setCurveAddressProvider(mockCurveAddressProvider.address);
    await curveEthStrategy.setCurveMinter(mockCurveMinter.address);
    await curveEthStrategy.setCurvePool(mockCurvePool.address);
    await curveEthStrategy.setDex(mockDex.address);
    await curveEthStrategy.setCurveTokenAddress(curveToken.address);
    await curveEthStrategy.setWETHTokenAddress(mockVaultToken.address);
    await curveEthStrategy.initCurveGauge();
  });

  describe("name", async () => {
    it("should return expected name", async () => {
      expect(await curveEthStrategy.name()).to.equal("CurveStEth");
    });
  });

  describe("checkWantToken", async () => {
    it("should fail if token address is not the want one", async () => {
      await expect(curveEthStrategy.setWETHTokenAddress(newStrategy.address)).to.be.revertedWith("wrong vault token");
    });
  });

  describe("estimatedTotalAssets", async () => {
    it("should return the correct asset value", async () => {
      const tokenAmount = ethers.utils.parseEther("100");
      const crvAmount = ethers.utils.parseEther("20");
      const exchangeAmountOut = ethers.utils.parseEther("10");
      const gaugeBalance = ethers.utils.parseEther("5");
      const withdrawAmountOut = ethers.utils.parseEther("5");
      await mockVaultToken.mock.balanceOf.returns(tokenAmount);
      await mockCurveGauge.mock.integrate_fraction.returns(crvAmount);
      await mockCurveMinter.mock.minted.returns(ethers.constants.Zero);
      await mockDex.mock.getAmountsOut.returns([0, exchangeAmountOut]);
      await mockCurveGauge.mock.balanceOf.returns(gaugeBalance);
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      const expectedTotal = tokenAmount.add(exchangeAmountOut).add(withdrawAmountOut);
      const got = await curveEthStrategy.estimatedTotalAssets();
      expect(expectedTotal).to.equal(got);
    });
  });

  describe("approveAll", async () => {
    it("should revert if the user is not authorised", async () => {
      await expect(curveEthStrategy.approveAll()).to.be.revertedWith("!authorized");
    });
    it("should approve on required tokens", async () => {
      await poolLpToken.mock.allowance.returns(0);
      await poolLpToken.mock.approve.returns(true);
      await curveToken.mock.allowance.returns(0);
      await curveToken.mock.approve.returns(true);
      await curveEthStrategy.connect(developer).approveAll();
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
      // need to make sure the strategy have some ether in order to deposit.
      // sending eth can't be mocked
      await network.provider.send("hardhat_setBalance", [curveEthStrategy.address, ethers.utils.parseEther("10").toHexString()]);
      await expect(curveEthStrategy.connect(developer).tend()).not.to.be.reverted;
    });

    it("should success when balance is 0", async () => {
      const balance = ethers.constants.Zero;
      await mockVault.mock.debtOutstanding.returns(0);
      await mockVaultToken.mock.balanceOf.returns(balance);
      await poolLpToken.mock.balanceOf.returns(balance);
      await expect(curveEthStrategy.connect(developer).tend()).not.to.be.reverted;
    });

    it("should not do anything if emergency exit", async () => {
      await mockVault.mock.revokeStrategy.returns();
      await mockVault.mock.debtOutstanding.returns(0);
      await curveEthStrategy.connect(governance).setEmergencyExit();
      await expect(curveEthStrategy.connect(developer).tend()).not.to.be.reverted;
    });
  });

  describe("prepareReturn", async () => {
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
      // no profit to report as we can't change the balanceOf what based the number of calls, so it will always be 0
      // no loss here as the debt value (2) is smaller than the estmiated total value (3.5)
      // no debt payment either
      expect(await curveEthStrategy.testPrepareReturn(ethers.constants.Zero))
        .to.emit(curveEthStrategy, "ReturnsReported")
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
      // no profit to report as we can't change the balanceOf what based the number of calls, so it will always be 0
      // there is loss here as the debt value (4) is bigger than the estmiated total value (3.5)
      // no debt payment either
      expect(await curveEthStrategy.testPrepareReturn(ethers.constants.Zero))
        .to.emit(curveEthStrategy, "ReturnsReported")
        .withArgs(ethers.constants.Zero, ethers.utils.parseEther("0.5"), ethers.constants.Zero);
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
      await mockCurvePool.mock.calc_token_amount.returns(ethers.utils.parseEther("0.5"));
      await mockCurveGauge.mock.withdraw.returns();
      await mockCurvePool.mock.remove_liquidity_one_coin.returns(ethers.utils.parseEther("0.5"));
      await mockVaultToken.mock.deposit.returns();
      // needed to exchange eth to weth
      await network.provider.send("hardhat_setBalance", [curveEthStrategy.address, ethers.utils.parseEther("10").toHexString()]);
      // no profit to report as we can't change the balanceOf what based the number of calls, so it will always be 0
      // there is loss here as the debt value (4) is bigger than the estmiated total value (3.5)
      // debtpayment is 1
      expect(await curveEthStrategy.testPrepareReturn(ethers.utils.parseEther("1")))
        .to.emit(curveEthStrategy, "ReturnsReported")
        .withArgs(ethers.constants.Zero, ethers.utils.parseEther("0.5"), ethers.utils.parseEther("1"));
    });
  });

  describe("prepareMigration", async () => {
    it("should success", async () => {
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.transfer.returns(true);
      await curveToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockDex.mock.swapExactTokensForTokens.returns([0, ethers.utils.parseEther("1")]);
      await mockCurveGauge.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockCurveGauge.mock.withdraw.returns();
      await mockCurvePool.mock.remove_liquidity_one_coin.returns(ethers.utils.parseEther("1"));
      await network.provider.send("hardhat_setBalance", [curveEthStrategy.address, ethers.utils.parseEther("10").toHexString()]);
      await mockVaultToken.mock.deposit.returns();
      await expect(curveEthStrategy.testPrepareMigration(newStrategy.address)).not.to.be.reverted;
    });
  });

  describe("liquidatePosition", async () => {
    it("success when withdraw is not needed", async () => {
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockDex.mock.swapExactTokensForTokens.returns([0, ethers.utils.parseEther("1")]);
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseEther("3"));
      // want is less than balance, so no withdraw is needed
      await expect(await curveEthStrategy.testLiquidatePosition(ethers.utils.parseEther("2")))
        .to.emit(curveEthStrategy, "LiquidationReported")
        .withArgs(ethers.utils.parseEther("2"), 0);
    });

    it("success when withdraw is needed", async () => {
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockDex.mock.swapExactTokensForTokens.returns([0, ethers.utils.parseEther("1")]);
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseEther("1"));
      await mockCurvePool.mock.calc_token_amount.returns(ethers.utils.parseEther("1"));
      await mockCurveGauge.mock.balanceOf.returns(ethers.utils.parseEther("0.5"));
      await mockCurveGauge.mock.withdraw.returns();
      await mockCurvePool.mock.remove_liquidity_one_coin.returns(ethers.utils.parseEther("0.5"));
      await network.provider.send("hardhat_setBalance", [curveEthStrategy.address, ethers.utils.parseEther("10").toHexString()]);
      await mockVaultToken.mock.deposit.returns();
      // want is more than balance, so withdraw is needed
      // total liquidated = balance + remove_liquidity_one_coin = 1.5
      // total want = 2
      // loss = 0.5
      await expect(await curveEthStrategy.testLiquidatePosition(ethers.utils.parseEther("2")))
        .to.emit(curveEthStrategy, "LiquidationReported")
        .withArgs(ethers.utils.parseEther("1.5"), ethers.utils.parseEther("0.5"));
    });
  });

  describe("protectedTokens", async () => {
    it("should return the expected protected tokens", async () => {
      const tokens = await curveEthStrategy.testProtectedTokens();
      expect(tokens).to.deep.equal([curveToken.address, poolLpToken.address]);
    });
  });
  describe("onHarvest", async () => {
    it("should set the user checkpoint", async () => {
      await mockCurveGauge.mock.user_checkpoint.returns(true);
      await expect(curveEthStrategy.testOnHarvest()).not.to.be.reverted;
    });
  });
});
