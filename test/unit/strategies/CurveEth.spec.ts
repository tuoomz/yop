import { expect } from "chai";
import { ContractFactory } from "@ethersproject/contracts";
import { ethers, network } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { VaultStrategyDataStore } from "../../../types/VaultStrategyDataStore";
import { TokenMock } from "../../../types/TokenMock";
import curveAddressProviderABI from "../abis/curveAddressProvider.json";
import curveGaugeABI from "../abis/curveGauge.json";
import curveRegistryABI from "../abis/curveRegistry.json";
import curveMinterABI from "../abis/curveMinter.json";
import curvePoolABI from "../abis/curvePlainPool.json";
import dexABI from "../abis/sushiSwapRouter.json";
import { CurveEthStrategyMock } from "../../../types/CurveEthStrategyMock";
import { YOPVaultRewardsMock } from "../../../types/YOPVaultRewardsMock";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { waffle } = require("hardhat");
const { deployMockContract } = waffle;

describe("CurveEth strategy", async () => {
  let SingleAssetVaultFactory: ContractFactory;
  let VaultStrategyDataStoreFactory: ContractFactory;
  let vault: SingleAssetVault;
  let vaultStrategyDataStore: VaultStrategyDataStore;
  let vaultToken: TokenMock;
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let strategist: SignerWithAddress;
  let user: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let rewards: SignerWithAddress;
  let depositor: SignerWithAddress;
  let manager: SignerWithAddress;
  let poolLpToken: TokenMock;
  let curveToken: TokenMock;

  let mockCurvePool: any;
  let mockCurveGauge: any;
  let mockCurveRegistry: any;
  let mockCurveMinter: any;
  let mockCurveAddressProvider: any;
  let mockDex: any;

  let curveEthStrategy: CurveEthStrategyMock;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, rewards, depositor, manager, strategist, user] = await ethers.getSigners();
    SingleAssetVaultFactory = await ethers.getContractFactory("SingleAssetVault");
    vault = (await SingleAssetVaultFactory.deploy()) as SingleAssetVault;
    await vault.deployed();

    VaultStrategyDataStoreFactory = await ethers.getContractFactory("VaultStrategyDataStore");
    vaultStrategyDataStore = (await VaultStrategyDataStoreFactory.deploy(governance.address)) as VaultStrategyDataStore;
    await vaultStrategyDataStore.deployed();

    const YOPRewardsFactory = await ethers.getContractFactory("YOPVaultRewardsMock");
    const yopRewards = (await YOPRewardsFactory.deploy()) as YOPVaultRewardsMock;
    await yopRewards.deployed();

    const TokenMockFactory = await ethers.getContractFactory("TokenMock");
    vaultToken = (await TokenMockFactory.deploy("vaultToken", "vt")) as TokenMock;
    await vaultToken.deployed();
    poolLpToken = (await TokenMockFactory.deploy("poolToken", "pt")) as TokenMock;
    await poolLpToken.deployed();
    curveToken = (await TokenMockFactory.deploy("mockCurve", "mc")) as TokenMock;
    await curveToken.deployed();

    await vault.initialize(
      "test vault",
      "tv",
      governance.address,
      gatekeeper.address,
      rewards.address,
      vaultStrategyDataStore.address,
      vaultToken.address,
      ethers.constants.AddressZero,
      yopRewards.address
    );
    await vaultStrategyDataStore.connect(governance).setVaultManager(vault.address, manager.address);

    mockCurvePool = await deployMockContract(deployer, curvePoolABI);
    mockCurveGauge = await deployMockContract(deployer, curveGaugeABI);
    mockCurveRegistry = await deployMockContract(deployer, curveRegistryABI);
    mockCurveMinter = await deployMockContract(deployer, curveMinterABI);
    mockCurveAddressProvider = await deployMockContract(deployer, curveAddressProviderABI);
    // the length of the array has to be 10 as that's defined in the ABI
    const gauges = [
      mockCurveGauge.address,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
    ];
    const gaugeTypes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    await mockCurveRegistry.mock.get_lp_token.returns(poolLpToken.address);
    await mockCurveRegistry.mock.get_gauges.returns(gauges, gaugeTypes);
    await mockCurveAddressProvider.mock.get_registry.returns(mockCurveRegistry.address);
    await mockCurveGauge.mock.lp_token.returns(poolLpToken.address);

    mockDex = await deployMockContract(deployer, dexABI);
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
