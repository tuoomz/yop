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
import { ERC20, StakingV2 } from "../../../types";
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
  const yopRewardsParams = [governance.address, gatekeeper.address, CONST.YOP_WHALE_ADDRESS, CONST.YOP_ADDRESS, now];
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

  const yopWalletAccount = await impersonate(CONST.YOP_WHALE_ADDRESS);
  await setEthBalance(CONST.YOP_WHALE_ADDRESS, ethers.utils.parseEther("10"));
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

  const yopContract = await ethers.getContractAt(ERC20ABI, CONST.YOP_ADDRESS);
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
  await yopRewards.initialize(governance.address, gatekeeper.address, CONST.YOP_WHALE_ADDRESS, CONST.YOP_ADDRESS, now);

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

  const yopWalletAccount = await impersonate(CONST.YOP_WHALE_ADDRESS);
  await setEthBalance(CONST.YOP_WHALE_ADDRESS, ethers.utils.parseEther("10"));
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

  const yopContract = await ethers.getContractAt(ERC20ABI, CONST.YOP_ADDRESS);
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

  const vault = (await SingleAssetVaultFactory.deploy()) as SingleAssetVaultV2;
  await vault.deployed();

  const VaultStrategyDataStoreFactory = await ethers.getContractFactory("VaultStrategyDataStore");
  const vaultStrategyDataStore = (await VaultStrategyDataStoreFactory.deploy(governance.address)) as VaultStrategyDataStore;
  await vaultStrategyDataStore.deployed();

  const YOPRewardsFactory = await ethers.getContractFactory("YOPRewardsV2");
  const yopRewards = (await YOPRewardsFactory.deploy()) as YOPRewardsV2;
  await yopRewards.deployed();
  await yopRewards.initialize(governance.address, gatekeeper.address, CONST.YOP_WHALE_ADDRESS, CONST.YOP_ADDRESS, now);

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

  const StakingFactory = await ethers.getContractFactory("StakingV2");
  const yopStaking = (await StakingFactory.deploy()) as StakingV2;
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

  const yopWalletAccount = await impersonate(CONST.YOP_WHALE_ADDRESS);
  await setEthBalance(CONST.YOP_WHALE_ADDRESS, ethers.utils.parseEther("10"));
  await vault["initialize(string,string,address,address,address,address,address,address,address,address)"](
    "test vault",
    "test",
    governance.address,
    gatekeeper.address,
    feeCollection.address,
    vaultStrategyDataStore.address,
    tokenAddress,
    accessManager.address,
    yopRewards.address,
    yopStaking.address
  );
  await yopRewards.connect(governance).setStakingContractAddress(yopStaking.address);
  await yopRewards.connect(governance).setRewardsAllocationWeights(5000, 5000);
  await yopRewards.connect(governance).setPerVaultRewardsWeight([vault.address], [100]);

  const yopContract = await ethers.getContractAt(ERC20ABI, CONST.YOP_ADDRESS);
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

export async function setupWBTCVault() {
  return setupVault(CONST.WBTC_ADDRESS);
}

export async function impersonate(account: string) {
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [account],
  });
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
  await setEthBalance(from, ethers.utils.parseEther("10"));
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
  staking?: string
) {
  // add some eth
  await setEthBalance(userAccount.address, ethers.utils.parseEther("10"));
  // transfer some tokens
  await transferERC20Tokens(tokenAddress, from, userAccount.address, amount);
  // transfer some YOP
  await transferERC20Tokens(
    CONST.YOP_ADDRESS,
    CONST.YOP_WHALE_ADDRESS,
    userAccount.address,
    ethers.utils.parseUnits("200000", CONST.YOP_DECIMALS)
  );
  // approve
  if (vault) {
    const tokenContract = (await ethers.getContractAt(ERC20ABI, tokenAddress)) as ERC20;
    await tokenContract.connect(userAccount).approve(vault, ethers.constants.MaxUint256);
  }
  if (staking) {
    const yopContract = (await ethers.getContractAt(ERC20ABI, CONST.YOP_ADDRESS)) as ERC20;
    await yopContract.connect(userAccount).approve(staking, ethers.constants.MaxUint256);
  }
}
