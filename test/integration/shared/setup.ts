import { ethers, network, upgrades } from "hardhat";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { VaultStrategyDataStore } from "../../../types/VaultStrategyDataStore";
import { YOPRewards } from "../../../types/YOPRewards";
import { AccessControlManager } from "../../../types/AccessControlManager";
import { BigNumber } from "ethers";
import { Staking } from "../../../types/Staking";
import ERC20ABI from "../../../abi/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json";
import { AllowAnyAccessControl } from "../../../types/AllowAnyAccessControl";
import { SanctionsListAccessControl } from "../../../types/SanctionsListAccessControl";
import { FeeCollection } from "../../../types/FeeCollection";
import { SingleAssetVaultV2 } from "../../../types/SingleAssetVaultV2";
import { ERC20, StakingV2, YOPRegistry, YOPRouter } from "../../../types";
import { CONST } from "../../constants";
import { YOPRewardsV2 } from "../../../types/YOPRewardsV2";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

export async function setupUpgradeableVault(tokenAddress: string) {
  const now = Math.round(new Date().getTime() / 1000);
  const [, governance, gatekeeper, rewardsWallet, owner] = await ethers.getSigners();

  const VaultStrategyDataStoreFactory = await ethers.getContractFactory("VaultStrategyDataStore");
  const vaultStrategyDataStore = (await VaultStrategyDataStoreFactory.deploy(governance.address)) as VaultStrategyDataStore;
  await vaultStrategyDataStore.deployed();

  const YOPRewardsFactory = await ethers.getContractFactory("YOPRewards");
  const yopRewardsParams = [governance.address, gatekeeper.address, CONST.TOKENS.YOP.WHALE, CONST.TOKENS.YOP.ADDRESS, now];
  const yopRewards = (await upgrades.deployProxy(YOPRewardsFactory, yopRewardsParams, { kind: "uups" })) as YOPRewards;
  await yopRewards.deployed();

  const AllowAnyAccessControlFactory = await ethers.getContractFactory("AllowAnyAccessControl");
  const allowAnyAccessControl = (await AllowAnyAccessControlFactory.deploy(governance.address)) as AllowAnyAccessControl;
  await allowAnyAccessControl.deployed();
  await allowAnyAccessControl.connect(governance).setDefault(true);

  const AccessManagerFactory = await ethers.getContractFactory("AccessControlManager");
  const accessManager = (await AccessManagerFactory.deploy(governance.address, [allowAnyAccessControl.address], [])) as AccessControlManager;
  await accessManager.deployed();
  const FeeCollectionFactory = await ethers.getContractFactory("FeeCollection");
  const feeCollection = (await FeeCollectionFactory.deploy()) as FeeCollection;
  await feeCollection.deployed();
  await feeCollection.initialize(
    governance.address,
    gatekeeper.address,
    rewardsWallet.address,
    vaultStrategyDataStore.address,
    2000, // 20%
    1000, // 10%
    1000 // 10%
  );

  const StakingFactory = await ethers.getContractFactory("Staking");
  const stakingParams = [
    "Yop staking",
    "syop",
    governance.address,
    gatekeeper.address,
    yopRewards.address,
    "https://example.com",
    "https://example.com",
    owner.address,
    accessManager.address,
  ];
  const yopStaking = (await upgrades.deployProxy(StakingFactory, stakingParams, { kind: "uups" })) as Staking;
  await yopStaking.deployed();

  const yopWalletAccount = await impersonate(CONST.TOKENS.YOP.WHALE);
  await setEthBalance(CONST.TOKENS.YOP.WHALE, ethers.utils.parseEther("10"));
  const VaultUtils = await ethers.getContractFactory("VaultUtils");
  const vaultUtils = await VaultUtils.deploy();
  const SingleAssetVaultFactory = await ethers.getContractFactory("SingleAssetVault", {
    libraries: {
      VaultUtils: vaultUtils.address,
    },
  });
  const params = [
    "test vault",
    "test",
    governance.address,
    gatekeeper.address,
    feeCollection.address,
    vaultStrategyDataStore.address,
    tokenAddress,
    accessManager.address,
    yopRewards.address,
  ];
  const vault = (await upgrades.deployProxy(SingleAssetVaultFactory, params, {
    kind: "uups",
    unsafeAllow: ["external-library-linking"],
  })) as SingleAssetVault;
  await vault.deployed();

  await yopRewards.connect(governance).setStakingContractAddress(yopStaking.address);
  await yopRewards.connect(governance).setRewardsAllocationWeights(5000, 5000);
  await yopRewards.connect(governance).setPerVaultRewardsWeight([vault.address], [100]);

  const yopContract = await ethers.getContractAt(ERC20ABI, CONST.TOKENS.YOP.ADDRESS);
  await yopContract.connect(yopWalletAccount).approve(yopRewards.address, ethers.constants.MaxUint256);
  return {
    vault,
    vaultStrategyDataStore,
    accessManager,
    yopRewards,
    governance,
    gatekeeper,
    feeCollection,
    yopStaking,
    yopWalletAccount,
    allowAnyAccessControl,
  };
}
export async function setupVault(tokenAddress: string) {
  const now = Math.round(new Date().getTime() / 1000);
  const [, governance, gatekeeper, rewardsWallet, owner] = await ethers.getSigners();
  const VaultUtils = await ethers.getContractFactory("VaultUtils");
  const vaultUtils = await VaultUtils.deploy();
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

  const YOPRewardsFactory = await ethers.getContractFactory("YOPRewards");
  const yopRewards = (await YOPRewardsFactory.deploy()) as YOPRewards;
  await yopRewards.deployed();
  await yopRewards.initialize(governance.address, gatekeeper.address, CONST.TOKENS.YOP.WHALE, CONST.TOKENS.YOP.ADDRESS, now);

  const AllowAnyAccessControlFactory = await ethers.getContractFactory("AllowAnyAccessControl");
  const allowAnyAccessControl = (await AllowAnyAccessControlFactory.deploy(governance.address)) as AllowAnyAccessControl;
  await allowAnyAccessControl.deployed();
  await allowAnyAccessControl.connect(governance).setDefault(true);

  const SanctionsListAccessControlFactory = await ethers.getContractFactory("SanctionsListAccessControl");
  const sanctionsListAccessControl = (await SanctionsListAccessControlFactory.deploy(
    governance.address,
    CONST.SANCTIONS_LIST_CONTRACT_ADDRESS
  )) as SanctionsListAccessControl;
  await sanctionsListAccessControl.deployed();

  const AccessManagerFactory = await ethers.getContractFactory("AccessControlManager");
  const accessManager = (await AccessManagerFactory.deploy(governance.address, [allowAnyAccessControl.address], [])) as AccessControlManager;
  await accessManager.deployed();
  const FeeCollectionFactory = await ethers.getContractFactory("FeeCollection");
  const feeCollection = (await FeeCollectionFactory.deploy()) as FeeCollection;
  await feeCollection.deployed();
  await feeCollection.initialize(
    governance.address,
    gatekeeper.address,
    rewardsWallet.address,
    vaultStrategyDataStore.address,
    2000, // 20%
    1000, // 10%
    1000 // 10%
  );

  const StakingFactory = await ethers.getContractFactory("Staking");
  const yopStaking = (await StakingFactory.deploy()) as Staking;
  await yopStaking.deployed();
  await yopStaking.initialize(
    "Yop staking",
    "syop",
    governance.address,
    gatekeeper.address,
    yopRewards.address,
    "https://example.com",
    "https://example.com",
    owner.address,
    accessManager.address
  );

  const yopWalletAccount = await impersonate(CONST.TOKENS.YOP.WHALE);
  await setEthBalance(CONST.TOKENS.YOP.WHALE, ethers.utils.parseEther("10"));
  await vault.initialize(
    "test vault",
    "test",
    governance.address,
    gatekeeper.address,
    feeCollection.address,
    vaultStrategyDataStore.address,
    tokenAddress,
    accessManager.address,
    yopRewards.address
  );
  await yopRewards.connect(governance).setStakingContractAddress(yopStaking.address);
  await yopRewards.connect(governance).setRewardsAllocationWeights(5000, 5000);
  await yopRewards.connect(governance).setPerVaultRewardsWeight([vault.address], [100]);

  const yopContract = await ethers.getContractAt(ERC20ABI, CONST.TOKENS.YOP.ADDRESS);
  await yopContract.connect(yopWalletAccount).approve(yopRewards.address, ethers.constants.MaxUint256);
  return {
    vault,
    vaultStrategyDataStore,
    accessManager,
    yopRewards,
    governance,
    gatekeeper,
    feeCollection,
    yopStaking,
    yopWalletAccount,
    allowAnyAccessControl,
    sanctionsListAccessControl,
  };
}

export async function setupVaultV2(tokenAddress: string) {
  const now = Math.round(new Date().getTime() / 1000);
  const [, governance, gatekeeper, rewardsWallet, owner] = await ethers.getSigners();
  const VaultUtils = await ethers.getContractFactory("VaultUtils");
  const vaultUtils = await VaultUtils.deploy();
  const SingleAssetVaultFactory = await ethers.getContractFactory("SingleAssetVaultV2", {
    libraries: {
      VaultUtils: vaultUtils.address,
    },
  });

  const VaultStrategyDataStoreFactory = await ethers.getContractFactory("VaultStrategyDataStore");
  const vaultStrategyDataStore = (await VaultStrategyDataStoreFactory.deploy(governance.address)) as VaultStrategyDataStore;
  await vaultStrategyDataStore.deployed();

  const YOPRewardsFactory = await ethers.getContractFactory("YOPRewardsV2");
  const yopRewards = (await upgrades.deployProxy(
    YOPRewardsFactory,
    [governance.address, gatekeeper.address, CONST.TOKENS.YOP.WHALE, CONST.TOKENS.YOP.ADDRESS, now],
    { kind: "uups" }
  )) as YOPRewardsV2;

  const AllowAnyAccessControlFactory = await ethers.getContractFactory("AllowAnyAccessControl");
  const allowAnyAccessControl = (await AllowAnyAccessControlFactory.deploy(governance.address)) as AllowAnyAccessControl;
  await allowAnyAccessControl.deployed();
  await allowAnyAccessControl.connect(governance).setDefault(true);
  const SanctionsListAccessControlFactory = await ethers.getContractFactory("SanctionsListAccessControl");
  const sanctionsListAccessControl = (await SanctionsListAccessControlFactory.deploy(
    governance.address,
    CONST.SANCTIONS_LIST_CONTRACT_ADDRESS
  )) as SanctionsListAccessControl;
  await sanctionsListAccessControl.deployed();

  const AccessManagerFactory = await ethers.getContractFactory("AccessControlManager");
  const accessManager = (await AccessManagerFactory.deploy(governance.address, [allowAnyAccessControl.address], [])) as AccessControlManager;
  await accessManager.deployed();
  const FeeCollectionFactory = await ethers.getContractFactory("FeeCollection");
  const feeCollection = (await upgrades.deployProxy(
    FeeCollectionFactory,
    [governance.address, gatekeeper.address, rewardsWallet.address, vaultStrategyDataStore.address, 2000, 1000, 1000],
    { kind: "uups" }
  )) as FeeCollection;

  const StakingFactory = await ethers.getContractFactory("StakingV2");
  const yopStaking = (await upgrades.deployProxy(
    StakingFactory,
    [
      "Yop staking",
      "syop",
      governance.address,
      gatekeeper.address,
      yopRewards.address,
      "https://example.com",
      "https://example.com",
      owner.address,
      accessManager.address,
    ],
    { kind: "uups" }
  )) as StakingV2;

  const yopWalletAccount = await impersonate(CONST.TOKENS.YOP.WHALE);
  await setEthBalance(CONST.TOKENS.YOP.WHALE, ethers.utils.parseEther("10"));
  const vaultParams = [
    "test vault",
    "test",
    governance.address,
    gatekeeper.address,
    feeCollection.address,
    vaultStrategyDataStore.address,
    tokenAddress,
    accessManager.address,
    yopRewards.address,
    yopStaking.address,
  ];
  const vault = (await upgrades.deployProxy(SingleAssetVaultFactory, vaultParams, {
    kind: "uups",
    unsafeAllow: ["external-library-linking"],
    initializer: "initializeV2",
  })) as SingleAssetVaultV2;

  const YOPRegistryFactory = await ethers.getContractFactory("YOPRegistry");
  const yopRegistry = (await upgrades.deployProxy(YOPRegistryFactory, [governance.address], { kind: "uups" })) as YOPRegistry;
  await yopRegistry.connect(governance).registerVault(vault.address);

  const YOPRouterFactory = await ethers.getContractFactory("YOPRouter");
  const yopRouter = (await upgrades.deployProxy(
    YOPRouterFactory,
    [governance.address, yopStaking.address, CONST.UNISWAP_ADDRESS, yopRegistry.address, CONST.TOKENS.YOP.ADDRESS, CONST.WETH_ADDRESS],
    { kind: "uups" }
  )) as YOPRouter;

  await yopRewards.connect(governance).setStakingContractAddress(yopStaking.address);
  await yopRewards.connect(governance).setRewardsAllocationWeights(5000, 5000);
  await yopRewards.connect(governance).setPerVaultRewardsWeight([vault.address], [100]);

  const yopContract = await ethers.getContractAt(ERC20ABI, CONST.TOKENS.YOP.ADDRESS);
  await yopContract.connect(yopWalletAccount).approve(yopRewards.address, ethers.constants.MaxUint256);

  return {
    vault,
    vaultStrategyDataStore,
    accessManager,
    yopRewards,
    governance,
    gatekeeper,
    feeCollection,
    yopStaking,
    yopWalletAccount,
    allowAnyAccessControl,
    sanctionsListAccessControl,
    yopRegistry,
    yopRouter,
  };
}

export async function setupWBTCVault() {
  return setupVault(CONST.TOKENS.WBTC.ADDRESS);
}

export async function impersonate(account: string) {
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [account],
  });
  await setEthBalance(account, ethers.utils.parseEther("10"));
  const signer = await ethers.getSigner(account);
  return signer;
}

export async function setEthBalance(account: string, value: BigNumber) {
  await network.provider.send("hardhat_setBalance", [account, value.toHexString()]);
}

export async function jumpForward(duration: number) {
  await network.provider.request({
    method: "evm_increaseTime",
    params: [duration],
  });
}

export async function setNextBlockTimestamp(ts: number) {
  await network.provider.request({
    method: "evm_setNextBlockTimestamp",
    params: [ts],
  });
}

export async function transferERC20Tokens(tokenAddress: string, from: string, to: string, amount: BigNumber) {
  const tokenContract = (await ethers.getContractAt(ERC20ABI, tokenAddress)) as ERC20;
  await tokenContract.connect(await impersonate(from)).transfer(to, amount);
}

export async function reset(blockNumber = 13612911) {
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
          blockNumber: blockNumber,
        },
      },
    ],
  });
}

export async function prepareUseAccount(
  userAccount: SignerWithAddress,
  tokenAddress: string,
  from: string,
  amount: BigNumber,
  vault?: string,
  staking?: string,
  router?: string
) {
  // add some eth
  await setEthBalance(userAccount.address, ethers.utils.parseEther("10"));
  // transfer some tokens
  await transferERC20Tokens(tokenAddress, from, userAccount.address, amount);
  // transfer some YOP
  await transferERC20Tokens(
    CONST.TOKENS.YOP.ADDRESS,
    CONST.TOKENS.YOP.WHALE,
    userAccount.address,
    ethers.utils.parseUnits("200000", CONST.TOKENS.YOP.DECIMALS)
  );
  const tokenContract = (await ethers.getContractAt(ERC20ABI, tokenAddress)) as ERC20;
  const yopContract = (await ethers.getContractAt(ERC20ABI, CONST.TOKENS.YOP.ADDRESS)) as ERC20;
  // approve
  if (vault) {
    await tokenContract.connect(userAccount).approve(vault, ethers.constants.MaxUint256);
  }
  if (staking) {
    await yopContract.connect(userAccount).approve(staking, ethers.constants.MaxUint256);
  }
  if (router) {
    await tokenContract.connect(userAccount).approve(router, ethers.constants.MaxUint256);
    await yopContract.connect(userAccount).approve(router, ethers.constants.MaxUint256);
  }
}
