import { ethers, waffle } from "hardhat";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { VaultStrategyDataStore } from "../../../types/VaultStrategyDataStore";
import { TokenMock } from "../../../types/TokenMock";
import { YOPVaultRewardsMock } from "../../../types/YOPVaultRewardsMock";
import curveAddressProviderABI from "../../abis/curveAddressProvider.json";
import curveGaugeABI from "../../abis/curveGauge.json";
import curveRegistryABI from "../../abis/curveRegistry.json";
import curveMinterABI from "../../abis/curveMinter.json";
import curvePoolABI from "../../abis/curvePlainPool.json";
import dexABI from "../../abis/sushiSwapRouter.json";
import vaultABI from "../../../abi/SingleAssetVault.json";
import ERC20ABI from "../../../abi/ERC20.json";
import vaultStrategyDataStoreABI from "../../../abi/VaultStrategyDataStore.json";

const { deployMockContract } = waffle;

export async function setupVault() {
  const [, governance, gatekeeper, manager, rewards] = await ethers.getSigners();
  const SingleAssetVaultFactory = await ethers.getContractFactory("SingleAssetVault");
  const vault = (await SingleAssetVaultFactory.deploy()) as SingleAssetVault;
  await vault.deployed();

  const VaultStrategyDataStoreFactory = await ethers.getContractFactory("VaultStrategyDataStore");
  const vaultStrategyDataStore = (await VaultStrategyDataStoreFactory.deploy(governance.address)) as VaultStrategyDataStore;
  await vaultStrategyDataStore.deployed();

  const YOPRewardsFactory = await ethers.getContractFactory("YOPVaultRewardsMock");
  const yopRewards = (await YOPRewardsFactory.deploy()) as YOPVaultRewardsMock;
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
  const mockCurvePool = await deployMockContract(deployer, curvePoolABI);
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
  };
}
