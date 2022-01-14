import { ethers, network } from "hardhat";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { VaultStrategyDataStore } from "../../../types/VaultStrategyDataStore";
import { YOPRewards } from "../../../types/YOPRewards";
import { AccessControlManager } from "../../../types/AccessControlManager";
import { BigNumber } from "ethers";
import { Staking } from "../../../types/Staking";
import ERC20ABI from "../../../abi/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json";

export const YOP_WHALE_ADDRESS = "0x2f535f200847d4bc7ee6e2d6de9fcc40011f7214";
export const YOP_CONTRACT_ADDRESS = "0xae1eaae3f627aaca434127644371b67b18444051";
const WBTC_ADDRESS = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";

export async function setupVault(tokenAddress: string) {
  const now = Math.round(new Date().getTime() / 1000);
  const [, governance, gatekeeper, rewards] = await ethers.getSigners();
  const SingleAssetVaultFactory = await ethers.getContractFactory("SingleAssetVault");
  const vault = (await SingleAssetVaultFactory.deploy()) as SingleAssetVault;
  await vault.deployed();

  const VaultStrategyDataStoreFactory = await ethers.getContractFactory("VaultStrategyDataStore");
  const vaultStrategyDataStore = (await VaultStrategyDataStoreFactory.deploy(governance.address)) as VaultStrategyDataStore;
  await vaultStrategyDataStore.deployed();

  const YOPRewardsFactory = await ethers.getContractFactory("YOPRewards");
  const yopRewards = (await YOPRewardsFactory.deploy()) as YOPRewards;
  await yopRewards.deployed();
  await yopRewards.initialize(governance.address, gatekeeper.address, YOP_WHALE_ADDRESS, YOP_CONTRACT_ADDRESS, now);

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
    "https://example.com"
  );

  const yopWalletAccount = await impersonate(YOP_WHALE_ADDRESS);
  await setEthBalance(YOP_WHALE_ADDRESS, ethers.utils.parseEther("10"));
  const AccessManagerFactory = await ethers.getContractFactory("AccessControlManager");
  const accessManager = (await AccessManagerFactory.deploy(governance.address)) as AccessControlManager;
  await accessManager.deployed();
  await vault.initialize(
    "test vault",
    "test",
    governance.address,
    gatekeeper.address,
    rewards.address,
    vaultStrategyDataStore.address,
    tokenAddress,
    accessManager.address,
    yopRewards.address
  );
  await yopRewards.connect(governance).setStakingContractAddress(yopStaking.address);
  await yopRewards.connect(governance).setRewardsRatios(5000, 5000);
  await yopRewards.connect(governance).setPerVaultRewardsWeight([vault.address], [100]);

  const yopContract = await ethers.getContractAt(ERC20ABI, YOP_CONTRACT_ADDRESS);
  await yopContract.connect(yopWalletAccount).approve(yopRewards.address, ethers.constants.MaxUint256);
  return {
    vault,
    vaultStrategyDataStore,
    accessManager,
    yopRewards,
    governance,
    gatekeeper,
    rewards,
    yopStaking,
    yopWalletAccount,
  };
}

export async function setupWBTCVault() {
  return setupVault(WBTC_ADDRESS);
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
