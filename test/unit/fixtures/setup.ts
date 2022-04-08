import { ethers, waffle } from "hardhat";
import { MockContract } from "ethereum-waffle";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { VaultStrategyDataStore } from "../../../types/VaultStrategyDataStore";
import { TokenMock } from "../../../types/TokenMock";
import { YOPRewardsMock } from "../../../types/YOPRewardsMock";
import curveAddressProviderABI from "../../abis/curveAddressProvider.json";
import curveGaugeABI from "../../abis/curveGauge.json";
import curveRegistryABI from "../../abis/curveRegistry.json";
import curveMinterABI from "../../abis/curveMinter.json";
import curvePoolABI from "../../abis/curvePlainPool.json";
import dexABI from "../../abis/sushiSwapRouter.json";
import curvePooTrioABI from "../../abis/curvePlainPoolTrio.json";
import curveMetaPoolABI from "../../abis/curveMetaPool.json";
import vaultABI from "../../../abi/contracts/interfaces/IVault.sol/IVault.json";
import ERC20ABI from "../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import daiABI from "../../abis/coins/dai.json";
import usdtABI from "../../abis/coins/usdt.json";
import usdcABI from "../../abis/coins/usdc.json";
import vaultStrategyDataStoreABI from "../../../abi/contracts/vaults/VaultStrategyDataStore.sol/VaultStrategyDataStore.json";
import convexBoosterABI from "../../abis/convexBooster.json";
import convexRewardsABI from "../../abis/convexBaseRewards.json";

const { deployMockContract } = waffle;

export async function setupVault() {
  const [, governance, gatekeeper, manager, rewards] = await ethers.getSigners();
  const VaultUtilsFactory = await ethers.getContractFactory("VaultUtils");
  const vaultUtils = await VaultUtilsFactory.deploy();
  const SingleAssetVaultFactory = await ethers.getContractFactory("SingleAssetVault", {
    libraries: {
      VaultUtils: vaultUtils.address,
    },
  });
  const vault = (await SingleAssetVaultFactory.deploy()) as SingleAssetVault;
  await vault.deployed();

  const VaultStrategyDataStoreFactory = await ethers.getContractFactory("VaultStrategyDataStore");
  const vaultStrategyDataStore = (await VaultStrategyDataStoreFactory.deploy(governance.address)) as VaultStrategyDataStore;
  await vaultStrategyDataStore.deployed();

  const YOPRewardsFactory = await ethers.getContractFactory("YOPRewardsMock");
  const yopRewards = (await YOPRewardsFactory.deploy()) as YOPRewardsMock;
  await yopRewards.deployed();

  const TokenMockFactory = await ethers.getContractFactory("TokenMock");
  const vaultToken = (await TokenMockFactory.deploy("vaultToken", "vt")) as TokenMock;
  await vaultToken.deployed();

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
  return { vault, vaultToken, vaultStrategyDataStore, yopRewards, governance, gatekeeper, manager, rewards };
}

export async function setupMockVault() {
  const [deployer] = await ethers.getSigners();
  const mockVault = await deployMockContract(deployer, vaultABI);
  const mockVaultToken = await deployMockContract(deployer, ERC20ABI);
  const mockStrategyDataStore = await deployMockContract(deployer, vaultStrategyDataStoreABI);
  return { mockVault, mockVaultToken, mockStrategyDataStore };
}

export async function setupCurve() {
  const [deployer] = await ethers.getSigners();
  const poolLpToken = await deployMockContract(deployer, ERC20ABI);
  const curveToken = await deployMockContract(deployer, ERC20ABI);
  const curveMetaPoolLPToken = await deployMockContract(deployer, ERC20ABI);
  const mockCurvePool = await deployMockContract(deployer, curvePoolABI);
  const mockCurveMetaPool = await deployMockContract(deployer, curvePoolABI);
  const mockCurveGauge = await deployMockContract(deployer, curveGaugeABI);
  const mockCurveRegistry = await deployMockContract(deployer, curveRegistryABI);
  const mockCurveMinter = await deployMockContract(deployer, curveMinterABI);
  const mockCurveAddressProvider = await deployMockContract(deployer, curveAddressProviderABI);

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
  const mockDex = await deployMockContract(deployer, dexABI);
  return {
    mockCurveAddressProvider,
    mockCurveMinter,
    mockCurveRegistry,
    mockCurvePool,
    mockCurveGauge,
    mockDex,
    poolLpToken,
    curveToken,
    curveMetaPoolLPToken,
    mockCurveMetaPool,
  };
}

export async function setupCurveTrio() {
  const [deployer] = await ethers.getSigners();
  const TokenMockFactory = await ethers.getContractFactory("TokenMock");
  const poolLpToken = (await TokenMockFactory.deploy("poolToken", "pt")) as TokenMock; // 3crv
  await poolLpToken.deployed();
  const mockMetaPoolLpToken = (await TokenMockFactory.deploy("metaPoolToken", "mpt")) as TokenMock; // usdn3crv
  await mockMetaPoolLpToken.deployed();
  const curveToken = (await TokenMockFactory.deploy("mockCurve", "mc")) as TokenMock;
  await curveToken.deployed();

  const mockDai = await deployMockContract(deployer, daiABI);
  const mockUsdc = await deployMockContract(deployer, usdtABI);
  const mockUsdt = await deployMockContract(deployer, usdcABI);

  const mockCurvePool = await deployMockContract(deployer, curvePooTrioABI);
  const mockCurveMetaPool = await deployMockContract(deployer, curveMetaPoolABI);
  const mockCurveGauge = await deployMockContract(deployer, curveGaugeABI);
  const mockCurveRegistry = await deployMockContract(deployer, curveRegistryABI);
  const mockCurveMinter = await deployMockContract(deployer, curveMinterABI);
  const mockCurveAddressProvider = await deployMockContract(deployer, curveAddressProviderABI);

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
  const mockDex = await deployMockContract(deployer, dexABI);
  return {
    mockCurveAddressProvider,
    mockCurveRegistry,
    mockCurveMinter,
    mockCurvePool,
    mockCurveMetaPool,
    mockCurveGauge,
    mockDex,
    poolLpToken,
    mockMetaPoolLpToken,
    curveToken,
    mockDai,
    mockUsdc,
    mockUsdt,
  };
}

export async function setupVaultAndCurveTrio() {
  const vault = await setupVault();
  const strat = await setupCurveTrio();
  await strat.mockCurvePool.mock.coins.withArgs(0).returns(vault.vaultToken.address);
  await strat.mockCurvePool.mock.coins.withArgs(1).returns(strat.mockUsdc.address);
  await strat.mockCurvePool.mock.coins.withArgs(2).returns(strat.mockUsdt.address);
  return { ...vault, ...strat };
}

export async function setupConvex(): Promise<{
  mockConvexBooster: MockContract;
  mockConvexRewards: MockContract;
  mockConvexToken: MockContract;
  mockLdoToken: MockContract;
}> {
  const [deployer] = await ethers.getSigners();
  const mockConvexBooster = await deployMockContract(deployer, convexBoosterABI);
  const mockConvexRewards = await deployMockContract(deployer, convexRewardsABI);
  const mockConvexToken = await deployMockContract(deployer, ERC20ABI);
  const mockLdoToken = await deployMockContract(deployer, ERC20ABI);
  return { mockConvexBooster, mockConvexRewards, mockConvexToken, mockLdoToken };
}

export async function setupConvexMocks() {
  const [deployer] = await ethers.getSigners();
  const mockConvexBooster = await deployMockContract(deployer, convexBoosterABI);
  const mockConvexRewards = await deployMockContract(deployer, convexRewardsABI);
  const TokenMockFactory = await ethers.getContractFactory("TokenMock");
  const mockConvexToken = (await TokenMockFactory.deploy("mockCurve", "mc")) as TokenMock;
  return { mockConvexBooster, mockConvexRewards, mockConvexToken, ...(await setupVaultAndCurveTrio()) };
}
