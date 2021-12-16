import { expect } from "chai";
import { ethers, waffle } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { VaultStrategyDataStore } from "../../../types/VaultStrategyDataStore";
import { TokenMock } from "../../../types/TokenMock";
import { CurveEthStrategyMock } from "../../../types/CurveEthStrategyMock";
import { setupVault, setupCurve } from "../fixtures/setup";
import { MockContract } from "ethereum-waffle";
const { loadFixture } = waffle;

describe("CurveEth strategy", async () => {
  let vault: SingleAssetVault;
  let vaultStrategyDataStore: VaultStrategyDataStore;
  let vaultToken: TokenMock;
  let governance: SignerWithAddress;
  let strategist: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let rewards: SignerWithAddress;
  let manager: SignerWithAddress;
  let curveToken: TokenMock;

  let mockCurvePool: MockContract;
  let mockCurveGauge: MockContract;
  let mockCurveMinter: MockContract;
  let mockCurveAddressProvider: MockContract;
  let mockDex: MockContract;

  let curveEthStrategy: CurveEthStrategyMock;

  beforeEach(async () => {
    const accounts = await ethers.getSigners();
    strategist = accounts[accounts.length - 1]; // go from the last to avoid conflicts with accounts returned from setupVault
    ({ vault, vaultToken, vaultStrategyDataStore, governance, gatekeeper, manager, rewards } = await loadFixture(setupVault));
    ({ mockCurveAddressProvider, mockCurveMinter, mockCurvePool, mockCurveGauge, mockDex, curveToken } = await loadFixture(setupCurve));
    const CurveEthStrategyFactory = await ethers.getContractFactory("CurveEthStrategyMock");
    curveEthStrategy = (await CurveEthStrategyFactory.deploy(
      vault.address,
      strategist.address,
      rewards.address,
      gatekeeper.address,
      mockCurvePool.address
    )) as CurveEthStrategyMock;
    await curveEthStrategy.deployed();
    await curveEthStrategy.setCurveAddressProvider(mockCurveAddressProvider.address);
    await curveEthStrategy.setCurveMinter(mockCurveMinter.address);
    await curveEthStrategy.setCurvePool(mockCurvePool.address);
    await curveEthStrategy.initCurveGauge();
    await curveEthStrategy.setDex(mockDex.address);
    await curveEthStrategy.setCurveTokenAddress(curveToken.address);
    await curveEthStrategy.setWETHTokenAddress(vaultToken.address);
    await curveEthStrategy.connect(governance).approveAll();

    await vaultStrategyDataStore
      .connect(manager)
      .addStrategy(vault.address, curveEthStrategy.address, 9500, 0, ethers.constants.MaxUint256, 100);
    await vault.connect(governance).unpause();
  });

  describe("estimatedTotalAssets", async () => {
    const tokenAmount = ethers.utils.parseEther("100");
    const crvAmount = ethers.utils.parseEther("20");
    const exchangeAmoutOut = ethers.utils.parseEther("10");
    const gaugeBalance = ethers.utils.parseEther("5");
    const withdrawAmoutOut = ethers.utils.parseEther("5");

    beforeEach(async () => {
      vaultToken.mint(curveEthStrategy.address, tokenAmount);
      await mockCurveGauge.mock.integrate_fraction.returns(crvAmount);
      await mockCurveMinter.mock.minted.returns(ethers.constants.Zero);
      await mockDex.mock.getAmountsOut.returns([0, exchangeAmoutOut]);
      await mockCurveGauge.mock.balanceOf.returns(gaugeBalance);
      await mockCurvePool.mock.calc_withdraw_one_coin.returns(withdrawAmoutOut);
    });

    it("should return the correct asset value", async () => {
      const expectedTotal = tokenAmount.add(exchangeAmoutOut).add(withdrawAmoutOut);
      const got = await curveEthStrategy.estimatedTotalAssets();
      expect(expectedTotal).to.equal(got);
    });
  });
});
