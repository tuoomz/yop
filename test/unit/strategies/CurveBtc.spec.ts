import { expect } from "chai";
import { ethers, waffle, network } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { CurveBtcStrategyMock } from "../../../types/CurveBtcStrategyMock";
import { setupMockVault, setupCurve } from "../fixtures/setup";
import { MockContract } from "ethereum-waffle";
import ERC20ABI from "../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import CurveZapDepositorABI from "../../abis/curvePoolZapDepositor.json";
const { loadFixture, deployMockContract } = waffle;

const TOKEN_DECIMALS = 8;
const SUSHISWAP_DEX_ADDRESS = "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F";
const UNISWAP_DEX_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

describe("CurveBtc strategy", async () => {
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
  let mockCurveRegistry: MockContract;
  let mockCurveMinter: MockContract;
  let mockCurveAddressProvider: MockContract;
  let mockDex: MockContract;

  let curveStrategy: CurveBtcStrategyMock;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, rewards, proposer, developer, newStrategy] = await ethers.getSigners();
    ({ mockVault } = await loadFixture(setupMockVault));
    user = (await ethers.getSigners()).reverse()[0];
    // don't run another `loadFixture` as it will cause some wired issues with hardhat.
    ({ mockCurveAddressProvider, mockCurveMinter, mockCurveGauge, mockCurveRegistry, mockDex, poolLpToken, curveToken } = await setupCurve());
    mockCurvePool = await deployMockContract(deployer, CurveZapDepositorABI);
    mockVaultToken = await deployMockContract(deployer, ERC20ABI);
    await mockVault.mock.token.returns(mockVaultToken.address);
    await mockVault.mock.approve.returns(true);
    await mockVault.mock.governance.returns(governance.address);
    await mockVault.mock.gatekeeper.returns(gatekeeper.address);
    await mockVaultToken.mock.allowance.returns(0);
    await mockVaultToken.mock.approve.returns(true);
    const CurveBTCStrategyFactory = await ethers.getContractFactory("CurveBtcStrategyMock");
    curveStrategy = (await CurveBTCStrategyFactory.deploy(
      mockVault.address,
      proposer.address,
      developer.address,
      gatekeeper.address,
      mockCurvePool.address
    )) as CurveBtcStrategyMock;
    await curveStrategy.deployed();
    await curveStrategy.setCurveAddressProvider(mockCurveAddressProvider.address);
    await curveStrategy.setCurveMinter(mockCurveMinter.address);
    await curveStrategy.setCurvePool(mockCurvePool.address);
    await curveStrategy.setDex(mockDex.address);
    await curveStrategy.setCurveTokenAddress(curveToken.address);
    await curveStrategy.setBTCTokenAddress(mockVaultToken.address);
    await curveStrategy.initCurveGauge(mockCurveGauge.address);
  });

  describe("name", async () => {
    it("should return expected name", async () => {
      expect(await curveStrategy.name()).to.equal("CurveWBTC");
    });
  });

  describe("checkWantToken", async () => {
    it("should fail if token address is not the want one", async () => {
      await expect(curveStrategy.setBTCTokenAddress(newStrategy.address)).to.be.revertedWith("wrong vault token");
    });
  });

  describe("switchDex", async () => {
    it("should fail if user is not authorised", async () => {
      await expect(curveStrategy.connect(user).switchDex(true)).to.be.revertedWith("!authorized");
    });
    it("should change dex", async () => {
      await curveToken.mock.allowance.returns(0);
      await curveToken.mock.approve.returns(true);
      expect(await curveStrategy.dex()).to.equal(mockDex.address);
      await curveStrategy.connect(governance).switchDex(true);
      expect(await curveStrategy.dex()).to.equal(UNISWAP_DEX_ADDRESS);
      await curveStrategy.connect(governance).switchDex(false);
      expect(await curveStrategy.dex()).to.equal(SUSHISWAP_DEX_ADDRESS);
      // this will fail if the strategy asks for token approval for the same dex again
      await curveToken.mock.allowance.returns(1000);
      await curveStrategy.connect(governance).switchDex(true);
      expect(await curveStrategy.dex()).to.equal(UNISWAP_DEX_ADDRESS);
    });
  });

  describe("estimatedTotalAssets", async () => {
    it("should return the correct asset value", async () => {
      const tokenAmount = ethers.utils.parseUnits("100", TOKEN_DECIMALS);
      const crvAmount = ethers.utils.parseUnits("20", TOKEN_DECIMALS);
      const exchangeAmountOut = ethers.utils.parseUnits("10", TOKEN_DECIMALS);
      const gaugeBalance = ethers.utils.parseUnits("5", TOKEN_DECIMALS);
      const withdrawAmountOut = ethers.utils.parseUnits("5", TOKEN_DECIMALS);
      await mockVaultToken.mock.balanceOf.returns(tokenAmount);
      await mockCurveGauge.mock.integrate_fraction.returns(crvAmount);
      await mockCurveMinter.mock.minted.returns(ethers.constants.Zero);
      await mockDex.mock.getAmountsOut.returns([0, 0, exchangeAmountOut]);
      await mockCurveGauge.mock.balanceOf.returns(gaugeBalance);
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmountOut);
      const expectedTotal = tokenAmount.add(exchangeAmountOut).add(withdrawAmountOut);
      const got = await curveStrategy.estimatedTotalAssets();
      expect(expectedTotal).to.equal(got);
    });
  });

  describe("approveAll", async () => {
    it("should revert if the user is not authorised", async () => {
      await expect(curveStrategy.approveAll()).to.be.revertedWith("!authorized");
    });
    it("should approve on required tokens", async () => {
      await poolLpToken.mock.allowance.returns(0);
      await poolLpToken.mock.approve.returns(true);
      await curveToken.mock.allowance.returns(0);
      await curveToken.mock.approve.returns(true);
      await mockVaultToken.mock.allowance.returns(0);
      await mockVault.mock.approve.returns(true);
      await curveStrategy.connect(developer).approveAll();
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
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("1", TOKEN_DECIMALS)]);
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));

      await expect(curveStrategy.connect(developer).tend()).not.to.be.reverted;
    });

    it("should success when balance is 0", async () => {
      const balance = ethers.constants.Zero;
      await mockVault.mock.debtOutstanding.returns(0);
      await mockVaultToken.mock.balanceOf.returns(balance);
      await poolLpToken.mock.balanceOf.returns(balance);
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("1", TOKEN_DECIMALS)]);
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));

      await expect(curveStrategy.connect(developer).tend()).not.to.be.reverted;
    });

    it("should not do anything if emergency exit", async () => {
      await mockVault.mock.revokeStrategy.returns();
      await mockVault.mock.debtOutstanding.returns(0);
      await curveStrategy.connect(governance).setEmergencyExit();
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("1", TOKEN_DECIMALS)]);
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));

      await expect(curveStrategy.connect(developer).tend()).not.to.be.reverted;
    });
  });

  describe("prepareReturn", async () => {
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
      // no profit to report as we can't change the balanceOf what based the number of calls, so it will always be 0
      // no loss here as the debt value (2) is smaller than the estmiated total value (3.5)
      // no debt payment either
      expect(await curveStrategy.testPrepareReturn(ethers.constants.Zero))
        .to.emit(curveStrategy, "ReturnsReported")
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
      // no profit to report as we can't change the balanceOf what based the number of calls, so it will always be 0
      // there is loss here as the debt value (4) is bigger than the estmiated total value (3.5)
      // no debt payment either
      expect(await curveStrategy.testPrepareReturn(ethers.constants.Zero))
        .to.emit(curveStrategy, "ReturnsReported")
        .withArgs(ethers.constants.Zero, ethers.utils.parseUnits("0.5", TOKEN_DECIMALS), ethers.constants.Zero);
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
      await mockCurvePool.mock.calc_token_amount.returns(ethers.utils.parseUnits("0.5", TOKEN_DECIMALS));
      await mockCurveGauge.mock.withdraw.returns();
      await mockCurvePool.mock.remove_liquidity_one_coin.returns(ethers.utils.parseUnits("0.5", TOKEN_DECIMALS));
      // no profit to report as we can't change the balanceOf what based the number of calls, so it will always be 0
      // there is loss here as the debt value (4) is bigger than the estmiated total value (3.5)
      // debtpayment is 1
      expect(await curveStrategy.testPrepareReturn(ethers.utils.parseUnits("1", TOKEN_DECIMALS)))
        .to.emit(curveStrategy, "ReturnsReported")
        .withArgs(ethers.constants.Zero, ethers.utils.parseUnits("0.5", TOKEN_DECIMALS), ethers.utils.parseUnits("1", TOKEN_DECIMALS));
    });
  });

  describe("prepareMigration", async () => {
    it("should success", async () => {
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.transfer.returns(true);
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("1", TOKEN_DECIMALS)]);
      await mockCurveGauge.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockCurveGauge.mock.withdraw.returns();
      await mockCurvePool.mock.remove_liquidity_one_coin.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await expect(curveStrategy.testPrepareMigration(newStrategy.address)).not.to.be.reverted;
    });
  });

  describe("liquidatePosition", async () => {
    it("success when withdraw is not needed", async () => {
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("1", TOKEN_DECIMALS)]);
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseUnits("3", TOKEN_DECIMALS));
      // want is less than balance, so no withdraw is needed
      await expect(await curveStrategy.testLiquidatePosition(ethers.utils.parseUnits("2", TOKEN_DECIMALS)))
        .to.emit(curveStrategy, "LiquidationReported")
        .withArgs(ethers.utils.parseUnits("2", TOKEN_DECIMALS), 0);
    });

    it("success when withdraw is needed", async () => {
      await mockCurveMinter.mock.mint.returns();
      await curveToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockDex.mock.swapExactTokensForTokens.returns([0, 0, ethers.utils.parseUnits("1", TOKEN_DECIMALS)]);
      await mockVaultToken.mock.balanceOf.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockCurvePool.mock.calc_token_amount.returns(ethers.utils.parseUnits("1", TOKEN_DECIMALS));
      await mockCurveGauge.mock.balanceOf.returns(ethers.utils.parseUnits("0.5", TOKEN_DECIMALS));
      await mockCurveGauge.mock.withdraw.returns();
      await mockCurvePool.mock.remove_liquidity_one_coin.returns(ethers.utils.parseUnits("0.5", TOKEN_DECIMALS));
      // want is more than balance, so withdraw is needed
      // total liquidated = balance + remove_liquidity_one_coin = 1.5
      // total want = 2
      // loss = 0.5
      await expect(await curveStrategy.testLiquidatePosition(ethers.utils.parseUnits("2", TOKEN_DECIMALS)))
        .to.emit(curveStrategy, "LiquidationReported")
        .withArgs(ethers.utils.parseUnits("1.5", TOKEN_DECIMALS), ethers.utils.parseUnits("0.5", TOKEN_DECIMALS));
    });
  });

  describe("protectedTokens", async () => {
    it("should return the expected protected tokens", async () => {
      const tokens = await curveStrategy.testProtectedTokens();
      expect(tokens).to.deep.equal([curveToken.address, poolLpToken.address]);
    });
  });
});
