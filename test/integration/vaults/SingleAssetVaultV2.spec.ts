import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SingleAssetVaultV2 } from "../../../types/SingleAssetVaultV2";
import { CONST } from "../../constants";
import { prepareUseAccount, setNextBlockTimestamp, setupVaultV2, setupUpgradeableVault, reset } from "../shared/setup";
import ERC20ABI from "../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import { ERC20, SingleAssetVault, YOPRewardsV2 } from "../../../types";
import { StakingV2 } from "../../../types/StakingV2";
import { YOPRewards } from "../../../types/YOPRewards";
import { Staking } from "../../../types/Staking";

const FIRST_MONTH_EMISSION = 342554;
const SECONDS_PER_MONTH = 2629743;
const SECONDS_PER_WEEK = 60 * 60 * 24 * 7;
const PRECISION = 1000000000;
let blockTime = Math.round(new Date().getTime() / 1000);

describe("SingleAssetVaultV2 Boosted Balance [@skip-on-coverage]", async () => {
  let vault: SingleAssetVaultV2;
  let governance: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let yopStaking: StakingV2;
  let yopRewards: YOPRewardsV2;
  let yopContract: ERC20;

  beforeEach(async () => {
    await reset(14212231);
    ({ vault, governance, yopStaking, yopRewards } = await setupVaultV2(CONST.TOKENS.USDC.ADDRESS));
    [user1, user2, user3] = (await ethers.getSigners()).reverse();
    await prepareUseAccount(
      user1,
      CONST.TOKENS.USDC.ADDRESS,
      CONST.TOKENS.USDC.WHALE,
      ethers.utils.parseUnits("100000", CONST.TOKENS.USDC.DECIMALS),
      vault.address,
      yopStaking.address
    );
    await prepareUseAccount(
      user2,
      CONST.TOKENS.USDC.ADDRESS,
      CONST.TOKENS.USDC.WHALE,
      ethers.utils.parseUnits("100000", CONST.TOKENS.USDC.DECIMALS),
      vault.address,
      yopStaking.address
    );
    await prepareUseAccount(
      user3,
      CONST.TOKENS.USDC.ADDRESS,
      CONST.TOKENS.USDC.WHALE,
      ethers.utils.parseUnits("100000", CONST.TOKENS.USDC.DECIMALS),
      vault.address,
      yopStaking.address
    );
    await vault.connect(governance).unpause();
    yopContract = (await ethers.getContractAt(ERC20ABI, CONST.TOKENS.YOP.ADDRESS)) as ERC20;
  });
  describe("boosted balance", async () => {
    it("check boosted balance", async () => {
      await setNextBlockTimestamp(blockTime);
      // user1 and user2 stakes, user3 don't
      const user1StakeAmount = ethers.utils.parseUnits("10000", CONST.TOKENS.YOP.DECIMALS);
      const user2StakeAmount = ethers.utils.parseUnits("5000", CONST.TOKENS.YOP.DECIMALS);
      await setNextBlockTimestamp(blockTime);
      await yopStaking.connect(user1).stake(user1StakeAmount, 12);
      await yopStaking.connect(user2).stake(user2StakeAmount, 36);
      // all users will deposit to the vault
      const user1DepositAmount = ethers.utils.parseUnits("1000", CONST.TOKENS.USDC.DECIMALS);
      const user2DepositAmount = ethers.utils.parseUnits("100", CONST.TOKENS.USDC.DECIMALS);
      const user3DepositAmount = ethers.utils.parseUnits("2000", CONST.TOKENS.USDC.DECIMALS);
      await vault.connect(user1).deposit(user1DepositAmount, user1.address);
      await vault.connect(user2).deposit(user2DepositAmount, user2.address);
      await vault.connect(user3).deposit(user3DepositAmount, user3.address);
      // check their boosted balances
      // math.min(1 * 1000 + 9 * (120000/300000) * 1000, 10*1000) = 4600
      const user1BoostedBalance = ethers.utils.parseUnits("4600", CONST.TOKENS.USDC.DECIMALS);
      expect(await vault.boostedBalanceOf(user1.address)).to.equal(user1BoostedBalance);
      // math.min(1 * 100 + 9 * (180000/300000) * 1100, 10*100) = 1000
      const user2BoostedBalance = ethers.utils.parseUnits("1000", CONST.TOKENS.USDC.DECIMALS);
      expect(await vault.boostedBalanceOf(user2.address)).to.equal(user2BoostedBalance);
      // math.min(1 * 2000 + 9 * (0/300000) * 3100, 10*2000) = 2000
      let user3BoostedBalance = ethers.utils.parseUnits("2000", CONST.TOKENS.USDC.DECIMALS);
      expect(await vault.boostedBalanceOf(user3.address)).to.equal(user3BoostedBalance);
      let totalBoosted = user1BoostedBalance.add(user2BoostedBalance).add(user3BoostedBalance);
      expect(await vault.totalBoostedSupply()).to.equal(totalBoosted);
      blockTime += SECONDS_PER_WEEK;
      // for tests rely on blocktime stamp, the block timestamp needs to be set manually, instead of using jumpForward.
      // this is because the local node is forked from a pinned block and the block timestamp will be pinned to that block
      await setNextBlockTimestamp(blockTime);
      let user3Rewards =
        (FIRST_MONTH_EMISSION / SECONDS_PER_MONTH) *
        0.5 * // 50% allocated to vaults
        SECONDS_PER_WEEK *
        (user3BoostedBalance.mul(PRECISION).div(totalBoosted).toNumber() / PRECISION);
      // user3 stake and boost the vault
      const user3StakeAmount = ethers.utils.parseUnits("1000", CONST.TOKENS.YOP.DECIMALS);
      expect(await yopStaking.connect(user3).stakeAndBoost(user3StakeAmount, 10, [vault.address]));
      // math.min(1 * 2000 + 9 * (10000/310000) * 3100, 10*2000) = 2900
      user3BoostedBalance = ethers.utils.parseUnits("2900", CONST.TOKENS.USDC.DECIMALS);
      expect(await vault.boostedBalanceOf(user3.address)).to.equal(user3BoostedBalance);
      totalBoosted = user1BoostedBalance.add(user2BoostedBalance).add(user3BoostedBalance);
      expect(await vault.totalBoostedSupply()).to.equal(totalBoosted);
      blockTime += SECONDS_PER_WEEK;
      await setNextBlockTimestamp(blockTime);
      const yopBalanceBefore = await yopContract.balanceOf(user3.address);
      await yopRewards.connect(user3).claimVaultRewards([vault.address], user3.address);
      const yopBalanceAfter = await yopContract.balanceOf(user3.address);
      const claimed = yopBalanceAfter.sub(yopBalanceBefore).toNumber();
      user3Rewards +=
        (FIRST_MONTH_EMISSION / SECONDS_PER_MONTH) *
        0.5 *
        SECONDS_PER_WEEK *
        (user3BoostedBalance.mul(PRECISION).div(totalBoosted).toNumber() / PRECISION);
      expect(parseFloat(ethers.utils.formatUnits(claimed, CONST.TOKENS.YOP.DECIMALS))).to.be.closeTo(user3Rewards, 20);
      blockTime += SECONDS_PER_MONTH * 11;
      await setNextBlockTimestamp(blockTime);
      await yopStaking.connect(user3).unstakeAllAndBoost(user3.address, [vault.address]);
      // math.min(1 * 2000 + 9 * (0/300000) * 3100, 10*2000) = 2000
      user3BoostedBalance = ethers.utils.parseUnits("2000", CONST.TOKENS.USDC.DECIMALS);
      expect(await vault.boostedBalanceOf(user3.address)).to.equal(user3BoostedBalance);
    });
  });
});

describe("Upgrade to SingleAssetVaultV2 [@skip-on-coverage]", async () => {
  let vault: SingleAssetVault;
  let yopRewards: YOPRewards;
  let yopStaking: Staking;
  let governance: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async () => {
    ({ vault, yopRewards, yopStaking, governance } = await setupUpgradeableVault(CONST.TOKENS.USDC.ADDRESS));
    [user1, user2] = (await ethers.getSigners()).reverse();
    await prepareUseAccount(
      user1,
      CONST.TOKENS.USDC.ADDRESS,
      CONST.TOKENS.USDC.WHALE,
      ethers.utils.parseUnits("100000", CONST.TOKENS.USDC.DECIMALS),
      vault.address,
      yopStaking.address
    );
    await prepareUseAccount(
      user2,
      CONST.TOKENS.USDC.ADDRESS,
      CONST.TOKENS.USDC.WHALE,
      ethers.utils.parseUnits("100000", CONST.TOKENS.USDC.DECIMALS),
      vault.address,
      yopStaking.address
    );
    await vault.connect(governance).unpause();
  });

  it("can upgrade to v2", async () => {
    // user1 and user2 stakes, user3 don't
    const user1StakeAmount = ethers.utils.parseUnits("10000", CONST.TOKENS.YOP.DECIMALS);
    const user2StakeAmount = ethers.utils.parseUnits("5000", CONST.TOKENS.YOP.DECIMALS);
    await yopStaking.connect(user1).stake(user1StakeAmount, 12);
    await yopStaking.connect(user2).stake(user2StakeAmount, 36);
    const user1DepositAmount = ethers.utils.parseUnits("1000", CONST.TOKENS.USDC.DECIMALS);
    const user2DepositAmount = ethers.utils.parseUnits("100", CONST.TOKENS.USDC.DECIMALS);
    await vault.connect(user1).deposit(user1DepositAmount, user1.address);
    await vault.connect(user2).deposit(user2DepositAmount, user2.address);
    expect(await vault.balanceOf(user1.address)).to.equal(user1DepositAmount);
    expect(await vault.balanceOf(user2.address)).to.equal(user2DepositAmount);
    // upgrade the yopRewards contract
    const YOPRewardsV2Factory = await ethers.getContractFactory("YOPRewardsV2", {
      signer: governance,
    });
    const yopRewardsV2 = (await upgrades.upgradeProxy(yopRewards, YOPRewardsV2Factory)) as YOPRewardsV2;
    // upgrade the staking contract
    const StakingV2Factory = await ethers.getContractFactory("StakingV2", {
      signer: governance,
    });
    const stakingV2 = (await upgrades.upgradeProxy(yopStaking, StakingV2Factory)) as StakingV2;
    // upgrade the vault contract
    const VaultUtils = await ethers.getContractFactory("VaultUtils");
    const vaultUtils = await VaultUtils.deploy();
    const VaultV2Factory = await ethers.getContractFactory("SingleAssetVaultV2", {
      signer: governance,
      libraries: {
        VaultUtils: vaultUtils.address,
      },
    });
    const vaultV2 = (await upgrades.upgradeProxy(vault, VaultV2Factory, { unsafeAllow: ["external-library-linking"] })) as SingleAssetVaultV2;
    await vaultV2.connect(governance).setBoostedFormulaWeights(1, 9);
    await vaultV2.connect(governance).setStakingContract(stakingV2.address);
    expect(await vaultV2.balanceOf(user1.address)).to.equal(user1DepositAmount);
    expect(await vaultV2.balanceOf(user2.address)).to.equal(user2DepositAmount);
    // after upgrade boostedBalanceOf should return the previous balance
    expect(await vaultV2.boostedBalanceOf(user1.address)).to.equal(user1DepositAmount);
    expect(await vaultV2.boostedBalanceOf(user2.address)).to.equal(user2DepositAmount);
    expect(await vaultV2.totalBoostedSupply()).to.equal(user1DepositAmount.add(user2DepositAmount));
    await vaultV2.connect(governance).updateBoostedBalancesForUsers([user1.address, user2.address]);
    // math.min(1 * 1000 + 9 * (120000/300000) * 1100, 10*1000) = 4960
    const user1BoostedBalance = ethers.utils.parseUnits("4960", CONST.TOKENS.USDC.DECIMALS);
    expect(await vaultV2.boostedBalanceOf(user1.address)).to.equal(user1BoostedBalance);
    // math.min(1 * 100 + 9 * (180000/300000) * 1100, 10*100) = 1000
    const user2BoostedBalance = ethers.utils.parseUnits("1000", CONST.TOKENS.USDC.DECIMALS);
    expect(await vaultV2.boostedBalanceOf(user2.address)).to.equal(user2BoostedBalance);
    expect(await vaultV2.totalBoostedSupply()).to.equal(user1BoostedBalance.add(user2BoostedBalance));
  });
});
