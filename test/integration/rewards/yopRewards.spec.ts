import { expect } from "chai";
import { setupVaultV2, impersonate, setEthBalance, setNextBlockTimestamp, reset, prepareUseAccount } from "../shared/setup";
import { ethers, upgrades } from "hardhat";
import { SingleAssetVaultV2 } from "../../../types/SingleAssetVaultV2";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import IWethABI from "../../../abi/contracts/interfaces/IWeth.sol/IWETH.json";
import ERC20ABI from "../../../abi/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json";
import { AccessControlManager, IWETH, VaultStrategyDataStore } from "../../../types";
import { YOPRewards } from "../../../types/YOPRewards";
import { BigNumber } from "ethers";
import { ERC20 } from "../../../types/ERC20";
import { StakingV2 } from "../../../types/StakingV2";
import { FeeCollection } from "../../../types/FeeCollection";
import { CONST } from "../../constants";

const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const WETH_WHALE_ADDRESS = "0x2f0b23f53734252bda2277357e97e1517d6b042a";
const WBTC_ADDRESS = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const WBTC_WHALE_ADDRESS = "0xbf72da2bd84c5170618fbe5914b0eca9638d5eb5";
const INITIAL_RATE = 34255400000000;
const ONE_UNIT = 100000000;
const SECONDS_PER_MONTH = 2629743;
let blockTime = Math.round(new Date().getTime() / 1000);
let currentEmissionRate = INITIAL_RATE;
let currentRateForVaults = currentEmissionRate * 0.5; // split between vaults and staking
let currentRateForStaking = currentEmissionRate * 0.5;
const ONE_THOUSAND_YOP = ethers.utils.parseUnits("1000", 8);
const ONE_YOP = ethers.utils.parseUnits("1", 8);
const THREE_THOUSAND_YOP = ethers.utils.parseUnits("3000", 8);

const yopToFull = (yop) => ethers.utils.parseUnits(`${yop}`, 8);

describe("yopRewards [@skip-on-coverage]", async () => {
  let vault: SingleAssetVaultV2;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let feeCollection: FeeCollection;
  let vaultStrategyDataStore: VaultStrategyDataStore;
  let accessManager: AccessControlManager;
  let yopRewards: YOPRewards;
  let yopStaking: StakingV2;
  let yopWalletAccount: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let wethContract: IWETH;
  let yopContract: ERC20;

  beforeEach(async () => {
    await reset(14356555);
    // setup the vault
    ({ vault, governance, gatekeeper, yopRewards, yopWalletAccount, yopStaking, feeCollection, vaultStrategyDataStore, accessManager } =
      await setupVaultV2(WETH_ADDRESS));

    // deploy the strategy
    [user1, user2] = (await ethers.getSigners()).reverse();
    await vault.connect(governance).unpause();

    // send some weth to the user
    wethContract = (await ethers.getContractAt(IWethABI, WETH_ADDRESS)) as IWETH;
    await setEthBalance(WETH_WHALE_ADDRESS, ethers.utils.parseEther("10"));
    await wethContract.connect(await impersonate(WETH_WHALE_ADDRESS)).transfer(user1.address, ethers.utils.parseEther("100"));
    await wethContract.connect(await impersonate(WETH_WHALE_ADDRESS)).transfer(user2.address, ethers.utils.parseEther("100"));
    await wethContract.connect(user1).approve(vault.address, ethers.constants.MaxUint256);
    await wethContract.connect(user2).approve(vault.address, ethers.constants.MaxUint256);
    yopContract = (await ethers.getContractAt(ERC20ABI, CONST.TOKENS.YOP.ADDRESS)) as ERC20;
    await yopContract.connect(yopWalletAccount).transfer(user1.address, ONE_THOUSAND_YOP.mul(10));
    await yopContract.connect(yopWalletAccount).transfer(user2.address, THREE_THOUSAND_YOP);
    await yopContract.connect(user1).approve(yopStaking.address, ethers.constants.MaxUint256);
    await yopContract.connect(user2).approve(yopStaking.address, ethers.constants.MaxUint256);
  });

  describe("extend stake", async () => {
    describe("extend total working supply", async () => {
      beforeEach(async () => {
        blockTime += 60;
        await setNextBlockTimestamp(blockTime);
        // user1 stake 1000 yop for 6 months
        await yopStaking.connect(user1).stake(ONE_THOUSAND_YOP, 5);
        blockTime += 60 * 60 * 2;
        await setNextBlockTimestamp(blockTime);
      });

      it("should check baseline", async () => {
        const expectedTWS1 = yopToFull(1000 * 5);
        expect(expectedTWS1).to.equal(await yopStaking.totalWorkingSupply());
      });

      it("should extend duration only", async () => {
        await yopStaking.connect(user1).extendStake(0, 1, 0, []);
        const expectedTWS = yopToFull(1000 * 6);
        expect(BigNumber.from(expectedTWS)).to.equal(await yopStaking.totalWorkingSupply(), "extend duration only");
      });
      it("should extend amount only", async () => {
        await yopStaking.connect(user1).extendStake(0, 0, ONE_THOUSAND_YOP, []);
        const expectedTWS = yopToFull(2000 * 5);
        expect(BigNumber.from(expectedTWS)).to.equal(await yopStaking.totalWorkingSupply(), "extend amount only");
      });
      it("should extend amount and duration", async () => {
        await yopStaking.connect(user1).extendStake(0, 6, ONE_THOUSAND_YOP, []);
        const expectedTWS = yopToFull(2000 * 11);
        expect(BigNumber.from(expectedTWS)).to.equal(await yopStaking.totalWorkingSupply(), "extend amount and duration");
      });
    });

    it("should extend user's stake", async () => {
      blockTime += 60;
      await setNextBlockTimestamp(blockTime);
      // user1 stake 1000 yop for 6 months
      await yopStaking.connect(user1).stake(ONE_THOUSAND_YOP, 6); // stakeId 0
      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);
      // after 2 hours user2 stake 3000 yop for 3 months
      await yopStaking.connect(user2).stake(THREE_THOUSAND_YOP, 3); // stakeId 2

      await expect(yopStaking.connect(user1).extendStake(0, 18, ONE_THOUSAND_YOP, [])).to.emit(yopStaking, "StakeExtended");

      await expect(yopStaking.connect(user2).extendStake(1, 7, 0, [])).to.emit(yopStaking, "StakeExtended");
      const [user1stakeAfter, user2stakeAfter] = await Promise.all([yopStaking.stakes(0), yopStaking.stakes(1)]);
      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);

      expect(await yopContract.balanceOf(yopStaking.address)).to.be.equal(ONE_THOUSAND_YOP.add(THREE_THOUSAND_YOP).add(ONE_THOUSAND_YOP));
      expect(user1stakeAfter.amount).to.equal(ONE_THOUSAND_YOP.mul(2));
      expect(user1stakeAfter.lockPeriod).to.equal(6 + 18);
      expect(user2stakeAfter.amount).to.equal(THREE_THOUSAND_YOP);
      expect(user2stakeAfter.lockPeriod).to.equal(3 + 7);
    });

    it("should revert when balance is not enough", async () => {
      blockTime += 60;
      await setNextBlockTimestamp(blockTime);
      // user1 stake 1000 yop for 6 months
      await yopStaking.connect(user1).stake(ONE_THOUSAND_YOP, 6);
      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);
      await expect(yopStaking.connect(user1).extendStake(0, 18, THREE_THOUSAND_YOP.mul(10), [])).to.be.revertedWith("!balance");
    });

    it("should increase reward user's stake", async () => {
      blockTime += 60;
      await setNextBlockTimestamp(blockTime);
      // user1 stake 1000 yop for 6 months
      await yopStaking.connect(user2).stake(THREE_THOUSAND_YOP, 3); // 0
      await yopStaking.connect(user1).stake(ONE_THOUSAND_YOP, 6); // 1

      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);

      // empty extend to recalculate staking rewards
      await yopStaking.connect(user1).extendStake(1, 0, 1, []);
      const rewards1Per2Hours = await yopRewards.unclaimedStakingRewards([1]);
      const expectedRew1Per2Hours = Math.round((currentRateForStaking * 60 * 60 * 2 * (1000 * 6)) / (1000 * 6 + 3000 * 3) / SECONDS_PER_MONTH);
      expect(rewards1Per2Hours).to.closeTo(BigNumber.from(expectedRew1Per2Hours), ONE_UNIT);

      await yopRewards.connect(user1).claimStakingRewards(user1.address);
      await yopStaking.connect(user1).extendStake(1, 18, ONE_THOUSAND_YOP, []);

      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);
      const expectedRew2Per2Hours = Math.round((currentRateForStaking * 60 * 60 * 2 * (2000 * 24)) / (2000 * 24 + 3000 * 3) / SECONDS_PER_MONTH);
      // empty extend to recalculate staking rewards
      await yopStaking.connect(user1).extendStake(1, 0, 1, []);
      const rewards2Per2Hours = await yopRewards.unclaimedStakingRewards([1]);
      expect(rewards2Per2Hours.toNumber()).to.be.closeTo(expectedRew2Per2Hours, ONE_UNIT);
    });

    it("should increase boosted balance", async () => {
      await vault.connect(user1).deposit(ethers.utils.parseEther("1"), user1.address);
      await vault.connect(user2).deposit(ethers.utils.parseEther("10"), user2.address);
      const balance1 = ethers.utils.parseUnits((await vault.boostedBalanceOf(user1.address)).toString(), 8);

      await yopStaking.connect(user2).stakeAndBoost(ethers.utils.parseUnits("100", 8), 6, [vault.address]);
      await yopStaking.connect(user1).stakeAndBoost(ethers.utils.parseUnits("1", 8), 6, [vault.address]);

      blockTime += 60;
      await setNextBlockTimestamp(blockTime);

      await yopStaking.connect(user1).stakeAndBoost(ONE_YOP, 6, [vault.address]);
      const balance2 = ethers.utils.parseUnits((await vault.boostedBalanceOf(user1.address)).toString(), 8);
      expect(balance2).to.be.above(balance1);

      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);

      await yopStaking.connect(user1).extendStake(1, 50, ONE_THOUSAND_YOP, [vault.address]);
      const balance3 = ethers.utils.parseUnits((await vault.boostedBalanceOf(user1.address)).toString(), 8);
      expect(balance3).to.be.above(balance2);
    });
  });
  describe("check yop rewards amount", async () => {
    const depositAmount = ethers.utils.parseEther("100");

    it("should only claim rewards from when liquidity is provided", async () => {
      blockTime += SECONDS_PER_MONTH; // 1 month later
      currentEmissionRate = INITIAL_RATE * 0.99; // split between vaults and staking
      currentRateForVaults = currentEmissionRate * 0.5;
      currentRateForStaking = currentEmissionRate * 0.5;
      const expectedRewards = Math.round((currentRateForVaults / SECONDS_PER_MONTH) * 60 * 60 * 2);
      await setNextBlockTimestamp(blockTime);
      // deposit to the vault a month after the rewards emission begins
      await vault.connect(user1).deposit(depositAmount, user1.address);
      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);
      // withdraw after 2 hours
      await vault.connect(user1).withdraw(ethers.constants.MaxUint256, user1.address, 100);
      const claimableRewards = await yopRewards.connect(user1).unclaimedVaultRewards(user1.address, [vault.address]);
      // rewards should be for only the 2 hours that liquidity was provided
      expect(claimableRewards).to.closeTo(BigNumber.from(expectedRewards), ONE_UNIT);
    });

    it("should update rewards when vault LP tokens are transferred", async () => {
      blockTime += 60;
      await setNextBlockTimestamp(blockTime);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      const b1 = await vault.balanceOf(user1.address);
      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);
      // after 2 hours, transfer half of the LP tokens to another user
      await vault.connect(user1).transfer(user2.address, b1.div(2));
      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);
      // both withdraw after 2 hours
      await vault.connect(user1).withdraw(ethers.constants.MaxUint256, user1.address, 100);
      await vault.connect(user2).withdraw(ethers.constants.MaxUint256, user2.address, 100);
      // user 1 rewards: full emission for the first 2 hours + half of the mission for the 2 hours
      const expectedUserRewards = Math.round(
        (currentRateForVaults * 60 * 60 * 2) / SECONDS_PER_MONTH + ((currentRateForVaults / 2) * 60 * 60 * 2) / SECONDS_PER_MONTH
      );
      const userClaimableRewards = await yopRewards.connect(user1).unclaimedVaultRewards(user1.address, [vault.address]);
      expect(userClaimableRewards).to.closeTo(BigNumber.from(expectedUserRewards), ONE_UNIT);
      // user 2 rewards: half of the missions for 2 hours
      const expectedUser2Rewards = Math.round((currentRateForVaults / 2 / SECONDS_PER_MONTH) * 60 * 60 * 2);
      const user2ClaimableRewards = await yopRewards.connect(user2).unclaimedVaultRewards(user2.address, [vault.address]);
      expect(user2ClaimableRewards).to.closeTo(BigNumber.from(expectedUser2Rewards), ONE_UNIT);
    });

    it("should only claim rewards when staking is started", async () => {
      blockTime += 60;
      await setNextBlockTimestamp(blockTime);
      // user1 stake 1000 yop for 6 months
      await yopStaking.connect(user1).stake(ONE_THOUSAND_YOP, 6);
      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);
      // after 2 hours user2 stake 3000 yop for 3 months
      await yopStaking.connect(user2).stake(THREE_THOUSAND_YOP, 3);
      const user1BalanceBefore = await yopContract.balanceOf(user1.address);
      const user2BalanceBefore = await yopContract.balanceOf(user2.address);
      // wait for another hour and claim rewards
      blockTime += 60 * 60;
      await setNextBlockTimestamp(blockTime);
      await yopRewards.connect(user1).claimStakingRewards(user1.address);
      await yopRewards.connect(user2).claimStakingRewards(user2.address);

      const user1ExpectedRewards = Math.round(
        (currentRateForStaking * 60 * 60 * 2) / SECONDS_PER_MONTH +
          (currentRateForStaking * 60 * 60 * (1000 * 6)) / (1000 * 6 + 3000 * 3) / SECONDS_PER_MONTH
      );
      const user2ExpectedRewards = Math.round((currentRateForStaking * 60 * 60 * (3000 * 3)) / (1000 * 6 + 3000 * 3) / SECONDS_PER_MONTH);
      const user1Claimed = (await yopContract.balanceOf(user1.address)).sub(user1BalanceBefore);
      const user2Claimed = (await yopContract.balanceOf(user2.address)).sub(user2BalanceBefore);
      expect(user1Claimed).to.closeTo(BigNumber.from(user1ExpectedRewards), ONE_UNIT);
      expect(user2Claimed).to.closeTo(BigNumber.from(user2ExpectedRewards), ONE_UNIT);
    });

    it("new owner of a NFT token should be able to claim unclaimed rewards", async () => {
      blockTime += 60;
      await setNextBlockTimestamp(blockTime);
      // user1 stake 1000 yop for 6 months
      await yopStaking.connect(user1).stake(ONE_THOUSAND_YOP, 6);
      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);
      // after 2 hours user2 stake 3000 yop for 3 months
      await yopStaking.connect(user2).stake(THREE_THOUSAND_YOP, 3);
      // and user 1 transfer the stake to user2
      await yopStaking.connect(user1).safeTransferFrom(user1.address, user2.address, 0, 1, []);
      const user1BalanceBefore = await yopContract.balanceOf(user1.address);
      const user2BalanceBefore = await yopContract.balanceOf(user2.address);
      // wait for another hour and both user claim rewards
      blockTime += 60 * 60;
      await setNextBlockTimestamp(blockTime);
      await expect(yopRewards.connect(user1).claimStakingRewards(user1.address)).not.to.be.reverted;
      await yopRewards.connect(user2).claimStakingRewards(user2.address);
      const user2Claimed = (await yopContract.balanceOf(user2.address)).sub(user2BalanceBefore);
      const user2ExpectedRewards = Math.round((currentRateForStaking * 60 * 60 * 3) / SECONDS_PER_MONTH);
      expect(user2Claimed).to.closeTo(BigNumber.from(user2ExpectedRewards), ONE_UNIT);
    });

    it("claim all rewards", async () => {
      blockTime += 60;
      await setNextBlockTimestamp(blockTime);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      await vault.connect(user2).deposit(depositAmount, user2.address);
      await yopStaking.connect(user1).stake(ONE_THOUSAND_YOP, 6);
      await yopStaking.connect(user2).stake(THREE_THOUSAND_YOP, 3);
      const balanceBefore = await yopContract.balanceOf(user1.address);
      // wait for another hour and then claim all rewards
      blockTime += 60 * 60;
      await setNextBlockTimestamp(blockTime);
      await yopRewards.connect(user1).claimAll(user1.address);
      const claimedAmount = (await yopContract.balanceOf(user1.address)).sub(balanceBefore);
      const expectedAmount = Math.round(
        (currentRateForVaults * 60 * 60 * 0.5) / SECONDS_PER_MONTH +
          (currentRateForStaking * 60 * 60 * (1000 * 6)) / (1000 * 6 + 3000 * 3) / SECONDS_PER_MONTH
      );
      expect(claimedAmount).to.closeTo(BigNumber.from(expectedAmount), ONE_UNIT);
    });

    it("claim all rewards when unstake", async () => {
      blockTime += 60;
      await setNextBlockTimestamp(blockTime);
      await yopStaking.connect(user1).stake(ONE_THOUSAND_YOP, 1);
      await yopStaking.connect(user1).stake(ONE_THOUSAND_YOP, 1);
      await yopStaking.connect(user1).stake(ONE_THOUSAND_YOP, 1);
      const balanceBefore = await yopContract.balanceOf(user1.address);
      // wait for another hour and then claim all rewards
      blockTime += SECONDS_PER_MONTH;
      currentEmissionRate = currentEmissionRate * 0.99;
      currentRateForVaults = currentEmissionRate * 0.5;
      currentRateForStaking = currentEmissionRate * 0.5;
      await setNextBlockTimestamp(blockTime);
      await setEthBalance(yopStaking.address, ethers.utils.parseEther("10"));

      await yopRewards.connect(await impersonate(yopStaking.address)).calculateStakingRewards(0);
      let expectedRewards = await yopRewards.unclaimedStakingRewards([0]);
      expect(expectedRewards).to.gt(ethers.constants.Zero);
      await yopStaking.connect(user1).unstakeSingle(0, user1.address);
      const balanceAfterFirstUnstake = await yopContract.balanceOf(user1.address);
      let claimedAmount = balanceAfterFirstUnstake.sub(balanceBefore);
      let expectedAmount = expectedRewards.add(ONE_THOUSAND_YOP);
      expect(claimedAmount).to.closeTo(expectedAmount, ONE_UNIT);

      await yopRewards.connect(await impersonate(yopStaking.address)).calculateStakingRewards(1);
      await yopRewards.connect(await impersonate(yopStaking.address)).calculateStakingRewards(2);
      expectedRewards = await yopRewards.unclaimedStakingRewards([1, 2]);
      expect(expectedRewards).to.gt(ethers.constants.Zero);
      await yopStaking.connect(user1).unstakeAll(user1.address);
      const balanceAfterUnstakeAll = await yopContract.balanceOf(user1.address);
      claimedAmount = balanceAfterUnstakeAll.sub(balanceAfterFirstUnstake);
      expectedAmount = expectedRewards.add(ONE_THOUSAND_YOP).add(ONE_THOUSAND_YOP);
      expect(claimedAmount).to.closeTo(expectedAmount, ONE_UNIT);
    });
  });

  describe("add new vaults", async () => {
    let newVault: SingleAssetVaultV2;
    let wbtcContract: ERC20;
    beforeEach(async () => {
      const VaultUtils = await ethers.getContractFactory("VaultUtils");
      const vaultUtils = await VaultUtils.deploy();
      const SingleAssetVaultFactory = await ethers.getContractFactory("SingleAssetVaultV2", {
        libraries: {
          VaultUtils: vaultUtils.address,
        },
      });
      newVault = (await upgrades.deployProxy(
        SingleAssetVaultFactory,
        [
          "vault2",
          "v2",
          governance.address,
          gatekeeper.address,
          feeCollection.address,
          vaultStrategyDataStore.address,
          WBTC_ADDRESS,
          accessManager.address,
          yopRewards.address,
          yopStaking.address,
        ],
        {
          kind: "uups",
          unsafeAllow: ["external-library-linking"],
          initializer: "initializeV2",
        }
      )) as SingleAssetVaultV2;

      await newVault.connect(governance).unpause();
      wbtcContract = (await ethers.getContractAt(ERC20ABI, WBTC_ADDRESS)) as ERC20;
      await setEthBalance(WBTC_WHALE_ADDRESS, ethers.utils.parseEther("10"));
      const whaleAccount = await impersonate(WBTC_WHALE_ADDRESS);
      await wbtcContract.connect(whaleAccount).transfer(user1.address, ethers.utils.parseUnits("100", 8));
      await wbtcContract.connect(user1).approve(newVault.address, ethers.constants.MaxUint256);
    });

    it("rewards should start from when the vault is added to the rewards contract", async () => {
      blockTime += 60;
      await setNextBlockTimestamp(blockTime);
      await vault.connect(user1).deposit(ethers.utils.parseEther("100"), user1.address);
      blockTime += 60 * 60 * 24 * 7; // 7 days later
      await setNextBlockTimestamp(blockTime);
      // add the new vault, set weight to 100, which is the same as the first one. So emission should be split from this point
      await yopRewards.connect(governance).setPerVaultRewardsWeight([newVault.address], [100]);
      await newVault.connect(user1).deposit(ethers.utils.parseUnits("10", 8), user1.address);
      blockTime += 60 * 60 * 24 * 3; // 3 days later
      await setNextBlockTimestamp(blockTime);
      await yopRewards.connect(governance).setPerVaultRewardsWeight([vault.address, newVault.address], [100, 100]); // trigger to add new checkpoints for vaults
      // check the rewards
      const newVaultRewards = await yopRewards.totalRewardsForVault(newVault.address);
      const expectedNewVaultRewards = Math.round((currentRateForVaults * 60 * 60 * 24 * 3 * 0.5) / SECONDS_PER_MONTH);
      const vaultRewards = await yopRewards.totalRewardsForVault(vault.address);
      const expectedVaultRewards = Math.round(
        (currentRateForVaults * 60 * 60 * 24 * 7) / SECONDS_PER_MONTH + (currentRateForVaults * 60 * 60 * 24 * 3 * 0.5) / SECONDS_PER_MONTH
      );
      expect(newVaultRewards).to.closeTo(BigNumber.from(expectedNewVaultRewards), ONE_UNIT);
      expect(vaultRewards).to.closeTo(BigNumber.from(expectedVaultRewards), ONE_UNIT);
    });
  });

  describe("compound", async () => {
    beforeEach(async () => {
      blockTime += 60;
      await setNextBlockTimestamp(blockTime);
      await yopStaking.connect(user1).stake(ONE_THOUSAND_YOP, 2);
      await yopStaking.connect(user1).stake(THREE_THOUSAND_YOP, 2);
      await vault.connect(user1).deposit(ethers.utils.parseEther("1"), user1.address);
      await vault.connect(user2).deposit(ethers.utils.parseEther("10"), user2.address);
    });

    it("compoundForStaking", async () => {
      blockTime += SECONDS_PER_MONTH;
      await setNextBlockTimestamp(blockTime);
      currentEmissionRate = currentEmissionRate * 0.99;
      currentRateForVaults = currentEmissionRate * 0.5;
      currentRateForStaking = currentEmissionRate * 0.5;
      const yopStakingSigner = await impersonate(yopStaking.address);
      await yopRewards.connect(yopStakingSigner).calculateStakingRewards(0);
      await yopRewards.connect(yopStakingSigner).calculateStakingRewards(1);
      const stake0Rewards = await yopRewards.unclaimedStakingRewards([0]);
      const stake1Rewards = await yopRewards.unclaimedStakingRewards([1]);
      expect(stake0Rewards).to.gt(ethers.constants.Zero);
      expect(stake1Rewards).to.gt(ethers.constants.Zero);
      const stake0WorkingBalanceBefore = await yopStaking.workingBalanceOfStake(0);
      const stake1WorkingBalanceBefore = await yopStaking.workingBalanceOfStake(1);
      const yopBalanceBefore = await yopContract.balanceOf(yopStaking.address);
      await yopStaking.connect(governance).compoundForStaking([0, 1]);
      const yopBalanceAfter = await yopContract.balanceOf(yopStaking.address);
      expect(yopBalanceAfter.sub(yopBalanceBefore)).closeTo(stake0Rewards.add(stake1Rewards), ONE_UNIT);
      const stake0Amount = (await yopStaking.stakes(0)).amount;
      const stake1Amount = (await yopStaking.stakes(1)).amount;
      expect(stake0Amount).closeTo(ONE_THOUSAND_YOP.add(stake0Rewards), ONE_UNIT);
      expect(stake1Amount).closeTo(THREE_THOUSAND_YOP.add(stake1Rewards), ONE_UNIT);
      const totalWorkingSupplyAfter = await yopStaking.totalWorkingSupply();
      const stake0WorkingBalanceAfter = await yopStaking.workingBalanceOfStake(0);
      const stake1WorkingBalanceAfter = await yopStaking.workingBalanceOfStake(1);
      expect(stake0WorkingBalanceAfter.sub(stake0WorkingBalanceBefore)).to.closeTo(stake0Rewards.mul(2), ONE_UNIT);
      expect(stake1WorkingBalanceAfter.sub(stake1WorkingBalanceBefore)).to.closeTo(stake1Rewards.mul(2), ONE_UNIT);
      expect(totalWorkingSupplyAfter).to.closeTo(
        ONE_THOUSAND_YOP.add(stake0Rewards).mul(2).add(THREE_THOUSAND_YOP.add(stake1Rewards).mul(2)),
        ONE_UNIT
      );
    });

    it("compoundWithVaultRewards", async () => {
      blockTime += SECONDS_PER_MONTH;
      await setNextBlockTimestamp(blockTime);
      currentEmissionRate = currentEmissionRate * 0.99;
      currentRateForVaults = currentEmissionRate * 0.5;
      currentRateForStaking = currentEmissionRate * 0.5;
      const vaultSigner = await impersonate(vault.address);
      await yopRewards.connect(vaultSigner).calculateVaultRewards(user1.address);
      const vaultRewards = await yopRewards.unclaimedVaultRewards(user1.address, [vault.address]);
      expect(vaultRewards).to.gt(ethers.constants.Zero);
      const stake0WorkingBalanceBefore = await yopStaking.workingBalanceOfStake(0);
      const yopBalanceBefore = await yopContract.balanceOf(yopStaking.address);
      await yopStaking.compoundWithVaultRewards([user1.address], [0]);
      const yopBalanceAfter = await yopContract.balanceOf(yopStaking.address);
      expect(yopBalanceAfter.sub(yopBalanceBefore)).closeTo(vaultRewards, ONE_UNIT);
      const totalWorkingSupplyAfter = await yopStaking.totalWorkingSupply();
      const stake0WorkingBalanceAfter = await yopStaking.workingBalanceOfStake(0);
      const stake0Amount = (await yopStaking.stakes(0)).amount;
      expect(stake0Amount.sub(ONE_THOUSAND_YOP)).closeTo(vaultRewards, ONE_UNIT);
      expect(stake0WorkingBalanceAfter.sub(stake0WorkingBalanceBefore)).closeTo(vaultRewards.mul(2), ONE_UNIT);
      expect(totalWorkingSupplyAfter).closeTo(ONE_THOUSAND_YOP.add(vaultRewards).mul(2).add(THREE_THOUSAND_YOP.mul(2)), ONE_UNIT);
    });

    it("compoundForUser", async () => {
      blockTime += SECONDS_PER_MONTH;
      await setNextBlockTimestamp(blockTime);
      currentEmissionRate = currentEmissionRate * 0.99;
      currentRateForVaults = currentEmissionRate * 0.5;
      currentRateForStaking = currentEmissionRate * 0.5;
      const vaultSigner = await impersonate(vault.address);
      await yopRewards.connect(vaultSigner).calculateVaultRewards(user1.address);
      const yopStakingSigner = await impersonate(yopStaking.address);
      await yopRewards.connect(yopStakingSigner).calculateStakingRewards(0);
      await yopRewards.connect(yopStakingSigner).calculateStakingRewards(1);
      const vaultRewards = await yopRewards.unclaimedVaultRewards(user1.address, [vault.address]);
      const stake0Rewards = await yopRewards.unclaimedStakingRewards([0]);
      const stake1Rewards = await yopRewards.unclaimedStakingRewards([1]);
      const yopBalanceBefore = await yopContract.balanceOf(yopStaking.address);
      const stake0WorkingBalanceBefore = await yopStaking.workingBalanceOfStake(0);
      const stake1WorkingBalanceBefore = await yopStaking.workingBalanceOfStake(1);
      await yopStaking.compoundForUser(user1.address, 0);
      const yopBalanceAfter = await yopContract.balanceOf(yopStaking.address);
      expect(yopBalanceAfter.sub(yopBalanceBefore)).closeTo(vaultRewards.add(stake0Rewards).add(stake1Rewards), ONE_UNIT);
      const stake0Amount = (await yopStaking.stakes(0)).amount;
      const stake1Amount = (await yopStaking.stakes(1)).amount;
      expect(stake0Amount).closeTo(ONE_THOUSAND_YOP.add(stake0Rewards).add(vaultRewards), ONE_UNIT);
      expect(stake1Amount).closeTo(THREE_THOUSAND_YOP.add(stake1Rewards), ONE_UNIT);
      const totalWorkingSupplyAfter = await yopStaking.totalWorkingSupply();
      const stake0WorkingBalanceAfter = await yopStaking.workingBalanceOfStake(0);
      const stake1WorkingBalanceAfter = await yopStaking.workingBalanceOfStake(1);
      expect(stake0WorkingBalanceAfter.sub(stake0WorkingBalanceBefore)).to.closeTo(stake0Rewards.add(vaultRewards).mul(2), ONE_UNIT);
      expect(stake1WorkingBalanceAfter.sub(stake1WorkingBalanceBefore)).to.closeTo(stake1Rewards.mul(2), ONE_UNIT);
      expect(totalWorkingSupplyAfter).to.closeTo(
        ONE_THOUSAND_YOP.add(stake0Rewards).add(vaultRewards).mul(2).add(THREE_THOUSAND_YOP.add(stake1Rewards).mul(2)),
        ONE_UNIT
      );
    });
  });
});
