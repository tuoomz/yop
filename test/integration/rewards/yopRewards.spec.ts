import { expect } from "chai";
import { setupVault, impersonate, setEthBalance, setNextBlockTimestamp, YOP_WHALE_ADDRESS, YOP_CONTRACT_ADDRESS } from "../shared/setup";
import { ethers } from "hardhat";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import IWethABI from "../../../abi/contracts/interfaces/IWeth.sol/IWETH.json";
import ERC20ABI from "../../../abi/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json";
import { AccessControlManager, IWETH, VaultStrategyDataStore } from "../../../types";
import { YOPRewards } from "../../../types/YOPRewards";
import { BigNumber } from "ethers";
import { ERC20 } from "../../../types/ERC20";
import { Staking } from "../../../types/Staking";

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
const THREE_THOUSAND_YOP = ethers.utils.parseUnits("3000", 8);

describe("yopRewards [@skip-on-coverage]", async () => {
  let vault: SingleAssetVault;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let rewards: SignerWithAddress;
  let vaultStrategyDataStore: VaultStrategyDataStore;
  let accessManager: AccessControlManager;
  let yopRewards: YOPRewards;
  let yopStaking: Staking;
  let yopWalletAccount: SignerWithAddress;
  let user: SignerWithAddress;
  let user2: SignerWithAddress;
  let wethContract: IWETH;
  let yopContract: ERC20;

  beforeEach(async () => {
    // setup the vault
    ({ vault, governance, gatekeeper, yopRewards, yopWalletAccount, yopStaking, rewards, vaultStrategyDataStore, accessManager } =
      await setupVault(WETH_ADDRESS));
    // deploy the strategy
    [user, user2] = (await ethers.getSigners()).reverse();
    await vault.connect(governance).unpause();

    // send some weth to the user
    wethContract = (await ethers.getContractAt(IWethABI, WETH_ADDRESS)) as IWETH;
    await setEthBalance(WETH_WHALE_ADDRESS, ethers.utils.parseEther("10"));
    await wethContract.connect(await impersonate(WETH_WHALE_ADDRESS)).transfer(user.address, ethers.utils.parseEther("100"));
    await wethContract.connect(await impersonate(WETH_WHALE_ADDRESS)).transfer(user2.address, ethers.utils.parseEther("100"));
    await wethContract.connect(user).approve(vault.address, ethers.constants.MaxUint256);
    await wethContract.connect(user2).approve(vault.address, ethers.constants.MaxUint256);
    yopContract = (await ethers.getContractAt(ERC20ABI, YOP_CONTRACT_ADDRESS)) as ERC20;
    await yopContract.connect(yopWalletAccount).transfer(user.address, ONE_THOUSAND_YOP);
    await yopContract.connect(yopWalletAccount).transfer(user2.address, THREE_THOUSAND_YOP);
    await yopContract.connect(user).approve(yopStaking.address, ethers.constants.MaxUint256);
    await yopContract.connect(user2).approve(yopStaking.address, ethers.constants.MaxUint256);
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
      await vault.connect(user).deposit(depositAmount, user.address);
      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);
      // withdraw after 2 hours
      await vault.connect(user).withdraw(ethers.constants.MaxUint256, user.address, 100);
      const claimableRewards = await yopRewards.connect(user).unclaimedVaultRewards(user.address, [vault.address]);
      // rewards should be for only the 2 hours that liquidity was provided
      expect(claimableRewards).to.closeTo(BigNumber.from(expectedRewards), ONE_UNIT);
    });

    it("should update rewards when vault LP tokens are transferred", async () => {
      blockTime += 60;
      await setNextBlockTimestamp(blockTime);
      await vault.connect(user).deposit(depositAmount, user.address);
      const b1 = await vault.balanceOf(user.address);
      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);
      // after 2 hours, transfer half of the LP tokens to another user
      await vault.connect(user).transfer(user2.address, b1.div(2));
      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);
      // both withdraw after 2 hours
      await vault.connect(user).withdraw(ethers.constants.MaxUint256, user.address, 100);
      await vault.connect(user2).withdraw(ethers.constants.MaxUint256, user2.address, 100);
      // user 1 rewards: full emission for the first 2 hours + half of the mission for the 2 hours
      const expectedUserRewards = Math.round(
        (currentRateForVaults * 60 * 60 * 2) / SECONDS_PER_MONTH + ((currentRateForVaults / 2) * 60 * 60 * 2) / SECONDS_PER_MONTH
      );
      const userClaimableRewards = await yopRewards.connect(user).unclaimedVaultRewards(user.address, [vault.address]);
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
      await yopStaking.connect(user).stake(ONE_THOUSAND_YOP, 6);
      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);
      // after 2 hours user2 stake 3000 yop for 3 months
      await yopStaking.connect(user2).stake(THREE_THOUSAND_YOP, 3);
      const user1BalanceBefore = await yopContract.balanceOf(user.address);
      const user2BalanceBefore = await yopContract.balanceOf(user2.address);
      // wait for another hour and claim rewards
      blockTime += 60 * 60;
      await setNextBlockTimestamp(blockTime);
      await yopRewards.connect(user).claimStakingRewards(user.address);
      await yopRewards.connect(user2).claimStakingRewards(user2.address);

      const user1ExpectedRewards = Math.round(
        (currentRateForStaking * 60 * 60 * 2) / SECONDS_PER_MONTH +
          (currentRateForStaking * 60 * 60 * (1000 * 6)) / (1000 * 6 + 3000 * 3) / SECONDS_PER_MONTH
      );
      const user2ExpectedRewards = Math.round((currentRateForStaking * 60 * 60 * (3000 * 3)) / (1000 * 6 + 3000 * 3) / SECONDS_PER_MONTH);
      const user1Claimed = (await yopContract.balanceOf(user.address)).sub(user1BalanceBefore);
      const user2Claimed = (await yopContract.balanceOf(user2.address)).sub(user2BalanceBefore);
      expect(user1Claimed).to.closeTo(BigNumber.from(user1ExpectedRewards), ONE_UNIT);
      expect(user2Claimed).to.closeTo(BigNumber.from(user2ExpectedRewards), ONE_UNIT);
    });

    it("new owner of a NFT token should be able to claim unclaimed rewards", async () => {
      blockTime += 60;
      await setNextBlockTimestamp(blockTime);
      // user1 stake 1000 yop for 6 months
      await yopStaking.connect(user).stake(ONE_THOUSAND_YOP, 6);
      blockTime += 60 * 60 * 2;
      await setNextBlockTimestamp(blockTime);
      // after 2 hours user2 stake 3000 yop for 3 months
      await yopStaking.connect(user2).stake(THREE_THOUSAND_YOP, 3);
      // and user 1 transfer the stake to user2
      await yopStaking.connect(user).safeTransferFrom(user.address, user2.address, 0, 1, []);
      const user1BalanceBefore = await yopContract.balanceOf(user.address);
      const user2BalanceBefore = await yopContract.balanceOf(user2.address);
      // wait for another hour and both user claim rewards
      blockTime += 60 * 60;
      await setNextBlockTimestamp(blockTime);
      await expect(yopRewards.connect(user).claimStakingRewards(user.address)).to.be.revertedWith("nothing to claim");
      await yopRewards.connect(user2).claimStakingRewards(user2.address);
      const user2Claimed = (await yopContract.balanceOf(user2.address)).sub(user2BalanceBefore);
      const user2ExpectedRewards = Math.round((currentRateForStaking * 60 * 60 * 3) / SECONDS_PER_MONTH);
      expect(user2Claimed).to.closeTo(BigNumber.from(user2ExpectedRewards), ONE_UNIT);
    });

    it("claim all rewards", async () => {
      blockTime += 60;
      await setNextBlockTimestamp(blockTime);
      await vault.connect(user).deposit(depositAmount, user.address);
      await vault.connect(user2).deposit(depositAmount, user2.address);
      await yopStaking.connect(user).stake(ONE_THOUSAND_YOP, 6);
      await yopStaking.connect(user2).stake(THREE_THOUSAND_YOP, 3);
      const balanceBefore = await yopContract.balanceOf(user.address);
      // wait for another hour and then claim all rewards
      blockTime += 60 * 60;
      await setNextBlockTimestamp(blockTime);
      await yopRewards.connect(user).claimAll(user.address);
      const claimedAmount = (await yopContract.balanceOf(user.address)).sub(balanceBefore);
      const expectedAmount = Math.round(
        (currentRateForVaults * 60 * 60 * 0.5) / SECONDS_PER_MONTH +
          (currentRateForStaking * 60 * 60 * (1000 * 6)) / (1000 * 6 + 3000 * 3) / SECONDS_PER_MONTH
      );
      expect(claimedAmount).to.closeTo(BigNumber.from(expectedAmount), ONE_UNIT);
    });
  });

  describe("add new vaults", async () => {
    let newVault: SingleAssetVault;
    let wbtcContract: ERC20;
    beforeEach(async () => {
      const SingleAssetVaultFactory = await ethers.getContractFactory("SingleAssetVault");
      newVault = (await SingleAssetVaultFactory.deploy()) as SingleAssetVault;
      await newVault.deployed();
      await newVault.initialize(
        "vault2",
        "v2",
        governance.address,
        gatekeeper.address,
        rewards.address,
        vaultStrategyDataStore.address,
        WBTC_ADDRESS,
        accessManager.address,
        yopRewards.address
      );
      await newVault.connect(governance).unpause();
      wbtcContract = (await ethers.getContractAt(ERC20ABI, WBTC_ADDRESS)) as ERC20;
      await setEthBalance(WBTC_WHALE_ADDRESS, ethers.utils.parseEther("10"));
      const whaleAccount = await impersonate(WBTC_WHALE_ADDRESS);
      await wbtcContract.connect(whaleAccount).transfer(user.address, ethers.utils.parseUnits("100", 8));
      await wbtcContract.connect(user).approve(newVault.address, ethers.constants.MaxUint256);
    });

    it("rewards should start from when the vault is added to the rewards contract", async () => {
      blockTime += 60;
      await setNextBlockTimestamp(blockTime);
      await vault.connect(user).deposit(ethers.utils.parseEther("100"), user.address);
      blockTime += 60 * 60 * 24 * 7; // 7 days later
      await setNextBlockTimestamp(blockTime);
      // add the new vault, set weight to 100, which is the same as the first one. So emission should be split from this point
      await yopRewards.connect(governance).setPerVaultRewardsWeight([newVault.address], [100]);
      await newVault.connect(user).deposit(ethers.utils.parseUnits("10", 8), user.address);
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
});
