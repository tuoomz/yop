import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades, waffle } from "hardhat";
import { MockContract } from "ethereum-waffle";
import ERC20ABI from "../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import YOPRewardsABI from "../../../abi/contracts/rewards/YOPRewardsV2.sol/YOPRewardsV2.json";
import SingleAssetVaultV2ABI from "../../../abi/contracts/vaults/SingleAssetVaultV2.sol/SingleAssetVaultV2.json";
import { StakingV2Mock } from "../../../types";
import { BigNumber, ContractFactory } from "ethers";
import { monthsInSeconds } from "../utils/time";
const TOKEN_DECIMALS = 8;
const CONTRACT_URI = "https://yop.finance/"; // random url
const { deployMockContract } = waffle;
const _100_YOP = ethers.utils.parseUnits("100", TOKEN_DECIMALS);
const _200_YOP = ethers.utils.parseUnits("200", TOKEN_DECIMALS);
const _500_YOP = ethers.utils.parseUnits("500", TOKEN_DECIMALS);

describe("StakingV2", async () => {
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let user: SignerWithAddress;
  let owner: SignerWithAddress;
  let stakeToken: MockContract;
  let yopReward: MockContract;
  let StakingContractFactory: ContractFactory;
  let staking: StakingV2Mock;
  let vault1: MockContract;
  let vault2: MockContract;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, user, owner] = await ethers.getSigners();
    stakeToken = await deployMockContract(deployer, ERC20ABI);
    yopReward = await deployMockContract(deployer, YOPRewardsABI);
    StakingContractFactory = await ethers.getContractFactory("StakingV2Mock");
    const params = [
      "staking",
      "sta",
      governance.address,
      gatekeeper.address,
      yopReward.address,
      "https://example.com",
      CONTRACT_URI,
      owner.address,
      ethers.constants.AddressZero,
    ];
    staking = (await upgrades.deployProxy(StakingContractFactory, params, {
      kind: "uups",
      unsafeAllow: ["constructor"],
    })) as StakingV2Mock;
    await staking.deployed();
    await staking.setToken(stakeToken.address);
    await yopReward.mock.calculateStakingRewards.returns();
    await yopReward.mock.claimRewardsForStakes.returns(0, []);
    vault1 = await deployMockContract(deployer, SingleAssetVaultV2ABI);
    vault2 = await deployMockContract(deployer, SingleAssetVaultV2ABI);
  });

  it("totalSupply", async () => {
    expect(await staking.totalSupply()).to.equal(ethers.constants.Zero);
  });

  describe("extendStake", async () => {
    beforeEach(async () => {
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("1000", TOKEN_DECIMALS));
      await stakeToken.mock.transferFrom.returns(true);
      await vault1.mock.balanceOf.returns(BigNumber.from("100"));
      await vault1.mock.supportsInterface.returns(true);
      await vault1.mock.supportsInterface.withArgs("0xffffffff").returns(false);
      await vault1.mock.updateBoostedBalancesForUsers.returns();
      await vault2.mock.balanceOf.returns(BigNumber.from("0"));
      await vault2.mock.supportsInterface.returns(true);
      await vault2.mock.supportsInterface.withArgs("0xffffffff").returns(false);
    });
    it("should revert on extension by non-owner", async () => {
      await staking.connect(user).stakeAndBoost(_100_YOP, 1, [vault1.address, vault2.address]);
      await expect(staking.connect(governance).extendStake(0, 12, _100_YOP, [])).to.be.revertedWith("!owner");
    });
    it("should revert on zero extension", async () => {
      await staking.connect(user).stakeAndBoost(_100_YOP, 1, [vault1.address, vault2.address]);
      await expect(staking.connect(user).extendStake(0, 0, 0, [])).to.be.revertedWith("!parameters");
    });

    it("should revert if new lock period is greater than max", async () => {
      await staking.connect(user).stakeAndBoost(_100_YOP, 1, [vault1.address, vault2.address]);
      await expect(staking.connect(user).extendStake(0, 60, _100_YOP, [])).to.be.revertedWith("!duration");
    });

    it("should revert if new amount less than min", async () => {
      await staking.connect(user).stakeAndBoost(_100_YOP, 1, [vault1.address, vault2.address]);
      await staking.connect(governance).setMinStakeAmount(_500_YOP);
      await expect(staking.connect(user).extendStake(0, 12, _200_YOP, [])).to.be.revertedWith("!amount");
    });

    it("should revert if new amount greater than max", async () => {
      await staking.connect(user).stakeAndBoost(_100_YOP, 1, [vault1.address, vault2.address]);
      await staking.connect(governance).setStakingLimit(_200_YOP);
      await expect(staking.connect(user).extendStake(0, 12, _200_YOP, [])).to.be.revertedWith("limit");
    });

    it("should revert if not enough balance", async () => {
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("100", TOKEN_DECIMALS));
      await staking.connect(user).stakeAndBoost(_100_YOP, 1, [vault1.address, vault2.address]);
      await expect(staking.connect(user).extendStake(0, 0, _200_YOP, [])).to.be.revertedWith("!balance");
    });

    it("should extend both", async () => {
      await staking.connect(user).stakeAndBoost(_100_YOP, 1, [vault1.address, vault2.address]);
      await expect(staking.connect(user).extendStake(0, 12, _200_YOP, [])).not.to.be.reverted;
    });

    it("should extend duration only", async () => {
      await staking.connect(user).stakeAndBoost(_100_YOP, 1, [vault1.address, vault2.address]);
      await expect(staking.connect(user).extendStake(0, 12, 0, [])).to.emit(staking, "StakeExtended").withArgs(0, _100_YOP, 13, []);
    });

    it("should extend amount only", async () => {
      await staking.connect(user).stakeAndBoost(_100_YOP, 1, [vault1.address, vault2.address]);
      await expect(staking.connect(user).extendStake(0, 0, _100_YOP, [])).to.emit(staking, "StakeExtended").withArgs(0, _100_YOP.mul(2), 1, []);
    });
  });

  describe("stakeAndBoost", async () => {
    it("should revert if paused", async () => {
      await staking.connect(governance).pause();
      await expect(
        staking.stakeAndBoost(ethers.utils.parseUnits("100", TOKEN_DECIMALS), 1, [vault1.address, vault2.address])
      ).to.be.revertedWith("Pausable: paused");
    });
    it("should revert if the vault doesn't implement the vault interface", async () => {
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("100", TOKEN_DECIMALS));
      await stakeToken.mock.transferFrom.returns(true);
      await vault1.mock.supportsInterface.returns(false);
      await expect(
        staking.stakeAndBoost(ethers.utils.parseUnits("100", TOKEN_DECIMALS), 1, [vault1.address, vault2.address])
      ).to.be.revertedWith("!vault interface");
    });
    it("should success", async () => {
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("100", TOKEN_DECIMALS));
      await stakeToken.mock.transferFrom.returns(true);
      await vault1.mock.balanceOf.returns(BigNumber.from("100"));
      await vault1.mock.supportsInterface.returns(true);
      await vault1.mock.supportsInterface.withArgs("0xffffffff").returns(false);
      await vault1.mock.updateBoostedBalancesForUsers.returns();
      await vault2.mock.balanceOf.returns(BigNumber.from("0"));
      await vault2.mock.supportsInterface.returns(true);
      await vault2.mock.supportsInterface.withArgs("0xffffffff").returns(false);
      await expect(staking.stakeAndBoost(ethers.utils.parseUnits("100", TOKEN_DECIMALS), 1, [vault1.address, vault2.address])).not.to.be
        .reverted;
    });
  });

  describe("unstakeSingleAndBoost", async () => {
    beforeEach(async () => {
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("100", TOKEN_DECIMALS));
      await stakeToken.mock.transferFrom.returns(true);
      await staking.connect(user).stake(ethers.utils.parseUnits("100", TOKEN_DECIMALS), 1);
      await staking.setBlockTime(monthsInSeconds(2));
    });

    it("should revert if paused", async () => {
      await staking.connect(governance).pause();
      await expect(staking.connect(user).unstakeSingleAndBoost(0, user.address, [vault1.address])).to.be.revertedWith("Pausable: paused");
    });
    it("should revert if the vault doesn't implement the vault interface", async () => {
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("100", TOKEN_DECIMALS));
      await stakeToken.mock.transfer.returns(true);
      await vault1.mock.supportsInterface.returns(false);
      await expect(staking.connect(user).unstakeSingleAndBoost(0, user.address, [vault1.address, vault2.address])).to.be.revertedWith(
        "!vault interface"
      );
    });
    it("should success", async () => {
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("100", TOKEN_DECIMALS));
      await stakeToken.mock.transfer.returns(true);
      await vault1.mock.balanceOf.returns(BigNumber.from("100"));
      await vault1.mock.supportsInterface.returns(true);
      await vault1.mock.supportsInterface.withArgs("0xffffffff").returns(false);
      await vault1.mock.updateBoostedBalancesForUsers.returns();
      await vault2.mock.balanceOf.returns(ethers.constants.Zero);
      await vault2.mock.supportsInterface.returns(true);
      await vault2.mock.supportsInterface.withArgs("0xffffffff").returns(false);
      await expect(staking.connect(user).unstakeSingleAndBoost(0, user.address, [vault1.address, vault2.address])).not.to.be.reverted;
    });
  });

  describe("unstakeAllAndBoost", async () => {
    beforeEach(async () => {
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("100", TOKEN_DECIMALS));
      await stakeToken.mock.transferFrom.returns(true);
      await staking.connect(user).stake(ethers.utils.parseUnits("100", TOKEN_DECIMALS), 1);
      await staking.setBlockTime(monthsInSeconds(2));
    });

    it("should revert if paused", async () => {
      await staking.connect(governance).pause();
      await expect(staking.connect(user).unstakeAllAndBoost(user.address, [vault1.address])).to.be.revertedWith("Pausable: paused");
    });
    it("should revert if the vault doesn't implement the vault interface", async () => {
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("100", TOKEN_DECIMALS));
      await stakeToken.mock.transfer.returns(true);
      await vault1.mock.supportsInterface.returns(false);
      await expect(staking.connect(user).unstakeAllAndBoost(user.address, [vault1.address, vault2.address])).to.be.revertedWith(
        "!vault interface"
      );
    });
    it("should success", async () => {
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("100", TOKEN_DECIMALS));
      await stakeToken.mock.transfer.returns(true);
      await vault1.mock.balanceOf.returns(BigNumber.from("100"));
      await vault1.mock.supportsInterface.returns(true);
      await vault1.mock.supportsInterface.withArgs("0xffffffff").returns(false);
      await vault1.mock.updateBoostedBalancesForUsers.returns();
      await vault2.mock.balanceOf.returns(ethers.constants.Zero);
      await vault2.mock.supportsInterface.returns(true);
      await vault2.mock.supportsInterface.withArgs("0xffffffff").returns(false);
      await expect(staking.connect(user).unstakeAllAndBoost(user.address, [vault1.address, vault2.address])).not.to.be.reverted;
    });
  });

  describe("stakeForUser", async () => {
    it("should success", async () => {
      expect(await staking.balanceOf(user.address, 0)).to.equal(0);
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("100", TOKEN_DECIMALS));
      await stakeToken.mock.transferFrom.returns(true);
      await staking.stakeForUser(ethers.utils.parseUnits("100", TOKEN_DECIMALS), 1, user.address);
      expect(await staking.balanceOf(user.address, 0)).to.equal(1);
    });
  });

  describe("stakeAndBoostForUser", async () => {
    it("should success", async () => {
      expect(await staking.balanceOf(user.address, 0)).to.equal(0);
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("100", TOKEN_DECIMALS));
      await stakeToken.mock.transferFrom.returns(true);
      await vault1.mock.balanceOf.returns(BigNumber.from("100"));
      await vault1.mock.supportsInterface.returns(true);
      await vault1.mock.supportsInterface.withArgs("0xffffffff").returns(false);
      await vault1.mock.updateBoostedBalancesForUsers.returns();
      await vault2.mock.balanceOf.returns(BigNumber.from("0"));
      await vault2.mock.supportsInterface.returns(true);
      await vault2.mock.supportsInterface.withArgs("0xffffffff").returns(false);
      await expect(
        staking.stakeAndBoostForUser(ethers.utils.parseUnits("100", TOKEN_DECIMALS), 1, user.address, [vault1.address, vault2.address])
      ).not.to.be.reverted;
      expect(await staking.balanceOf(user.address, 0)).to.equal(1);
    });
  });

  describe("compoundForStaking", async () => {
    const amount = ethers.utils.parseUnits("100", TOKEN_DECIMALS);
    it("success", async () => {
      await yopReward.mock.claimRewardsForStakes.returns(100, [50, 50]);
      await stakeToken.mock.balanceOf.returns(amount);
      await stakeToken.mock.transferFrom.returns(true);
      await staking.connect(user).stake(amount, 3);
      await staking.compoundForStaking([0]);
    });
  });

  describe("compoundWithVaultRewards", async () => {
    const amount = ethers.utils.parseUnits("100", TOKEN_DECIMALS);
    it("should revert if user is not the owner of the stake", async () => {
      await yopReward.mock.claimVaultRewardsForUsers.returns(100, [50, 50]);
      await stakeToken.mock.balanceOf.returns(amount);
      await stakeToken.mock.transferFrom.returns(true);
      await staking.connect(user).stake(amount, 3);
      await expect(staking.compoundWithVaultRewards([owner.address], [0])).to.be.revertedWith("!owner");
    });
    it("success", async () => {
      await yopReward.mock.claimVaultRewardsForUsers.returns(100, [50, 50]);
      await stakeToken.mock.balanceOf.returns(amount);
      await stakeToken.mock.transferFrom.returns(true);
      await staking.connect(user).stake(amount, 3);
      await staking.compoundWithVaultRewards([user.address], [0]);
    });
  });

  describe("compoundForUser", async () => {
    const amount = ethers.utils.parseUnits("100", TOKEN_DECIMALS);
    it("should revert if user is not the owner of the stake", async () => {
      await yopReward.mock.claimRewardsForStakes.returns(100, [50, 50]);
      await yopReward.mock.claimVaultRewardsForUsers.returns(100, [50, 50]);
      await stakeToken.mock.balanceOf.returns(amount);
      await stakeToken.mock.transferFrom.returns(true);
      await staking.connect(user).stake(amount, 3);
      await expect(staking.compoundForUser(owner.address, 0)).to.be.revertedWith("!owner");
    });
    it("success", async () => {
      await yopReward.mock.claimRewardsForStakes.returns(100, [50, 50]);
      await yopReward.mock.claimVaultRewardsForUsers.returns(100, [50, 50]);
      await stakeToken.mock.balanceOf.returns(amount);
      await stakeToken.mock.transferFrom.returns(true);
      await staking.connect(user).stake(amount, 3);
      await staking.compoundForUser(user.address, 0);
    });
  });
});
