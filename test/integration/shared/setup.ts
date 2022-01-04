import { ethers, network } from "hardhat";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { VaultStrategyDataStore } from "../../../types/VaultStrategyDataStore";
import { YOPVaultRewards } from "../../../types/YOPVaultRewards";
import { AccessControlManager } from "../../../types/AccessControlManager";
import { BigNumber } from "ethers";

const YOP_WHALE_ADDRESS = "0x2f535f200847d4bc7ee6e2d6de9fcc40011f7214";
const YOP_CONTRACT_ADDRESS = "0xae1eaae3f627aaca434127644371b67b18444051";

export async function setupVault(tokenAddress: string) {
  const now = Math.round(new Date().getTime() / 1000);
  const [, governance, gatekeeper, rewards] = await ethers.getSigners();
  const SingleAssetVaultFactory = await ethers.getContractFactory("SingleAssetVault");
  const vault = (await SingleAssetVaultFactory.deploy()) as SingleAssetVault;
  await vault.deployed();

  const VaultStrategyDataStoreFactory = await ethers.getContractFactory("VaultStrategyDataStore");
  const vaultStrategyDataStore = (await VaultStrategyDataStoreFactory.deploy(governance.address)) as VaultStrategyDataStore;
  await vaultStrategyDataStore.deployed();

  const YOPRewardsFactory = await ethers.getContractFactory("YOPVaultRewards");
  const yopRewards = (await YOPRewardsFactory.deploy()) as YOPVaultRewards;
  await yopRewards.deployed();
  await yopRewards.initialize(governance.address, YOP_WHALE_ADDRESS, YOP_CONTRACT_ADDRESS, now);

  const yopWalletAccount = await impersonate(YOP_WHALE_ADDRESS);
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
  await yopRewards.connect(governance).setPerVaultRewardsWeight([vault.address], [100]);
  return {
    vault,
    vaultStrategyDataStore,
    accessManager,
    yopRewards,
    governance,
    gatekeeper,
    rewards,
    yopWalletAccount,
  };
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
