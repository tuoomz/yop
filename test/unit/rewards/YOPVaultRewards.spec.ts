import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ContractFactory } from "ethers";
import { ethers, network } from "hardhat";
import { YOPVaultRewardsMock } from "../../../types/YOPVaultRewardsMock";
import { daysInSeconds, monthsInSeconds, nowInSeconds, SECONDS_PER_MONTH } from "../utils/time";
import { TokenMock } from "../../../types/TokenMock";
import { impersonate } from "../utils/Impersonate";

describe("YOPVaultsReward", () => {
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let wallet: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let YOPVaultRewards: ContractFactory;
  let vaultRewardsContract: YOPVaultRewardsMock;

  const INITIAL_RATE = 34255400000000;
  const ONE_UNIT = 100000000;

  beforeEach(async () => {
    [, governance, wallet, user1, user2, user3] = await ethers.getSigners();
    YOPVaultRewards = await ethers.getContractFactory("YOPVaultRewardsMock");
    vaultRewardsContract = (await YOPVaultRewards.deploy(governance.address, wallet.address)) as YOPVaultRewardsMock;
    await vaultRewardsContract.deployed();
  });

  describe("constructor", async () => {
    it("should fail if wallet address is not valid", async () => {
      expect(YOPVaultRewards.deploy(governance.address, ethers.constants.AddressZero)).to.be.revertedWith("invalid wallet address");
    });
  });

  describe("rate", async () => {
    it("should return 0 when emission is not started", async () => {
      const startTime = daysInSeconds(1);
      await vaultRewardsContract.setEpochStartTime(startTime);
      await vaultRewardsContract.setBlocktimestamp(nowInSeconds());
      expect(await vaultRewardsContract.rate()).to.deep.equal([ethers.constants.Zero, ethers.constants.Zero]);
    });
    it("should return 0 when emission has stopped", async () => {
      const startTime = daysInSeconds(-2); // two days ago
      const endTime = daysInSeconds(-1); // 1 day ago;
      await vaultRewardsContract.setEpochStartTime(startTime);
      await vaultRewardsContract.setEpochEndTime(endTime);
      await vaultRewardsContract.setBlocktimestamp(nowInSeconds());
      expect(await vaultRewardsContract.rate()).to.deep.equal([ethers.constants.Zero, ethers.constants.Zero]);
    });
    it("should return the correct rate and epoch value for the first epoch", async () => {
      const startTime = monthsInSeconds(-0.5);
      const endTime = monthsInSeconds(119);
      await vaultRewardsContract.setEpochStartTime(startTime);
      await vaultRewardsContract.setEpochEndTime(endTime);
      await vaultRewardsContract.setBlocktimestamp(nowInSeconds());
      const rate = await vaultRewardsContract.rate();
      expect(rate[0]).to.equal(BigNumber.from(INITIAL_RATE));
      expect(rate[1]).to.equal(ethers.constants.One);
    });
    it("should return the correct rate and epoch value for the last epoch", async () => {
      const startTime = monthsInSeconds(-119.5);
      const endTime = monthsInSeconds(0.5);
      await vaultRewardsContract.setEpochStartTime(startTime);
      await vaultRewardsContract.setEpochEndTime(endTime);
      await vaultRewardsContract.setBlocktimestamp(nowInSeconds());
      const rate = await vaultRewardsContract.rate();
      const expected = BigNumber.from("10358983000000");
      expect(rate[0]).to.be.closeTo(expected, ONE_UNIT); // the difference is no more than 0.1 YOP
      expect(rate[1]).to.equal(BigNumber.from(120));
    });
  });

  describe("setRewardWallet", async () => {
    it("can not be set by unauthorized", async () => {
      await expect(vaultRewardsContract.setRewardWallet(user3.address)).to.be.revertedWith("governance only");
      let addr = await vaultRewardsContract.rewardsWallet();
      expect(addr).to.equal(wallet.address);
      await vaultRewardsContract.connect(governance).setRewardWallet(user3.address);
      addr = await vaultRewardsContract.rewardsWallet();
      expect(addr).to.equal(user3.address);
    });
  });

  describe("setPerVaultRewardsWeight", async () => {
    let vault1: TokenMock;
    let vault2: TokenMock;
    let vaults: Array<string>;

    beforeEach(async () => {
      const TokenMockContract = await ethers.getContractFactory("TokenMock");
      vault1 = (await TokenMockContract.deploy("vaultToken1", "vt1")) as TokenMock;
      await vault1.deployed();
      await vault1.mint(user1.address, ethers.utils.parseEther("1"));

      vault2 = (await TokenMockContract.deploy("vaultToken2", "vt2")) as TokenMock;
      await vault2.deployed();
      await vault2.mint(user1.address, ethers.utils.parseEther("1"));

      vaults = [vault1.address, vault2.address];
    });

    it("can not be set by non-governance", async () => {
      const points = [100, 80];
      await expect(vaultRewardsContract.connect(user1).setPerVaultRewardsWeight(vaults, points)).to.be.revertedWith("governance only");
    });

    it("can only be set by governance", async () => {
      const points = [100, 80];
      expect(await vaultRewardsContract.totalWeight()).to.equal(0);
      await expect(await vaultRewardsContract.connect(governance).setPerVaultRewardsWeight(vaults, points))
        .to.emit(vaultRewardsContract, "VaultRewardWeightUpdated")
        .withArgs(vault1.address, points[0])
        .to.emit(vaultRewardsContract, "VaultRewardWeightUpdated")
        .withArgs(vault2.address, points[1]);
      expect(await vaultRewardsContract.totalWeight()).to.equal(180);
      expect(await vaultRewardsContract.perVaultRewardsWeight(vault1.address)).to.equal(points[0]);
      expect(await vaultRewardsContract.perVaultRewardsWeight(vault2.address)).to.equal(points[1]);
    });

    it("the length of input arrays should be the same", async () => {
      const points = [100, 80];
      await expect(vaultRewardsContract.connect(governance).setPerVaultRewardsWeight([vault1.address], points)).to.be.revertedWith(
        "invalid input"
      );
    });

    it("should have not rewards when vault weights are not set", async () => {
      expect(await vaultRewardsContract.connect(user1).allUnclaimedRewards()).to.equal(0);
    });
  });

  describe("setVaultsRewardsRatio", async () => {
    let vault1: TokenMock;
    let vault2: TokenMock;
    let vaults: Array<string>;

    beforeEach(async () => {
      const TokenMockContract = await ethers.getContractFactory("TokenMock");
      vault1 = (await TokenMockContract.deploy("vaultToken1", "vt1")) as TokenMock;
      await vault1.deployed();
      await vault1.mint(user1.address, ethers.utils.parseEther("1"));

      vault2 = (await TokenMockContract.deploy("vaultToken2", "vt2")) as TokenMock;
      await vault2.deployed();
      await vault2.mint(user1.address, ethers.utils.parseEther("1"));

      vaults = [vault1.address, vault2.address];
      const points = [100, 80];
      await vaultRewardsContract.connect(governance).setPerVaultRewardsWeight(vaults, points);
    });

    it("can not be set by non-governance", async () => {
      expect(vaultRewardsContract.connect(user1).setVaultsRewardsRatio(100)).to.be.revertedWith("governance only");
    });

    it("ratio value can not exceed 100%", async () => {
      expect(vaultRewardsContract.connect(governance).setVaultsRewardsRatio(11000)).to.be.revertedWith("invalid ratio");
    });

    it("should not update ratio is value is the same", async () => {
      await expect(await vaultRewardsContract.connect(governance).setVaultsRewardsRatio(10000)).not.to.emit(
        vaultRewardsContract,
        "VaultsRewardsRatioUpdated"
      );
    });

    it("can only be set by governance", async () => {
      expect(await vaultRewardsContract.vaultsRewardsRatio()).to.equal(10000);
      const ratio = 5000;
      await expect(await vaultRewardsContract.connect(governance).setVaultsRewardsRatio(ratio))
        .to.emit(vaultRewardsContract, "VaultsRewardsRatioUpdated")
        .withArgs(ratio);
      expect(await vaultRewardsContract.vaultsRewardsRatio()).to.equal(ratio);
    });
  });

  describe("calculateRewards", async () => {
    let vault1: TokenMock;
    let vault2: TokenMock;

    beforeEach(async () => {
      const TokenMockContract = await ethers.getContractFactory("TokenMock");
      vault1 = (await TokenMockContract.deploy("vaultToken1", "vt1")) as TokenMock;
      await vault1.deployed();
      vault2 = (await TokenMockContract.deploy("vaultToken2", "vt2")) as TokenMock;
      await vault2.deployed();
      const points = [100, 50];
      await vaultRewardsContract.setInitialVaultWeights([vault1.address, vault2.address], points);

      // mint some tokens. This can be treated as user provide liquidity
      await vault1.mint(user1.address, ethers.utils.parseEther("1"));
      await vault1.mint(user2.address, ethers.utils.parseEther("2"));
      await vault2.mint(user2.address, ethers.utils.parseEther("1"));
      await vault2.mint(user3.address, ethers.utils.parseEther("1"));
    });

    it("can not be called by unauthorised", async () => {
      await expect(vaultRewardsContract.calculateRewards(vault1.address, user1.address)).to.be.revertedWith("not authorised");
      await expect(
        vaultRewardsContract.connect(await impersonate(vault2.address)).calculateRewards(vault1.address, user1.address)
      ).to.be.revertedWith("only vault");
      await expect(
        await vaultRewardsContract.connect(await impersonate(vault1.address)).calculateRewards(vault1.address, user1.address)
      ).to.emit(vaultRewardsContract, "RewardsDistributed");
    });

    it("inside the same epoch", async () => {
      const start = monthsInSeconds(-0.5);
      const end = monthsInSeconds(119.5);
      const now = nowInSeconds();
      await vaultRewardsContract.setEpochStartTime(start);
      await vaultRewardsContract.setEpochEndTime(end);
      await vaultRewardsContract.setBlocktimestamp(now); // within the first month
      const expectedUser1Rewards = BigNumber.from(now)
        .sub(BigNumber.from(start))
        .mul(INITIAL_RATE)
        .mul(100)
        .div(SECONDS_PER_MONTH)
        .div(150)
        .div(3);
      await expect(
        await vaultRewardsContract.connect(await impersonate(vault1.address)).calculateRewards(vault1.address, user1.address)
      ).to.emit(vaultRewardsContract, "RewardsDistributed");
      const user1Rewards = await (await vaultRewardsContract.claimRecords(user1.address)).totalAvailable;
      console.log("diff = %s", user1Rewards.sub(expectedUser1Rewards));
      expect(user1Rewards).to.closeTo(BigNumber.from(expectedUser1Rewards), ONE_UNIT); // within 0.1 token
    });

    it("start and end inside two consecutive epochs", async () => {
      const start = monthsInSeconds(-0.9);
      const epochEnd = monthsInSeconds(0.1);
      const end = monthsInSeconds(119.1);
      const blockTimestamp = monthsInSeconds(0.2); // the second month

      await vaultRewardsContract.setEpochStartTime(start);
      await vaultRewardsContract.setEpochEndTime(end);
      await vaultRewardsContract.setBlocktimestamp(blockTimestamp);

      const secondRate = INITIAL_RATE * 0.99;
      const expectedUser1Rewards = Math.round(
        (((epochEnd - start) * INITIAL_RATE + (blockTimestamp - epochEnd) * secondRate) / SECONDS_PER_MONTH) * (100 / 150) * (1 / 3)
      );
      await expect(
        await vaultRewardsContract.connect(await impersonate(vault1.address)).calculateRewards(vault1.address, user1.address)
      ).to.emit(vaultRewardsContract, "RewardsDistributed");
      const user1Rewards = await (await vaultRewardsContract.claimRecords(user1.address)).totalAvailable;
      console.log("diff = %s", user1Rewards.sub(expectedUser1Rewards));
      expect(user1Rewards).to.closeTo(BigNumber.from(expectedUser1Rewards), ONE_UNIT);
    });

    it("start and end in non-consecutive epochs", async () => {
      const start = monthsInSeconds(-0.9);
      const epoch1End = monthsInSeconds(0.1);
      const epoch2End = monthsInSeconds(1.1);
      const epoch3End = monthsInSeconds(2.1);
      const end = monthsInSeconds(119.1);
      const blockTimestamp = monthsInSeconds(2.2); // the forth month

      await vaultRewardsContract.setEpochStartTime(start);
      await vaultRewardsContract.setEpochEndTime(end);
      await vaultRewardsContract.setBlocktimestamp(blockTimestamp);

      const secondRate = INITIAL_RATE * 0.99;
      const thirdRate = secondRate * 0.99;
      const fourthRate = thirdRate * 0.99;

      const expectedUser1Rewards = Math.round(
        (((epoch1End - start) * INITIAL_RATE +
          SECONDS_PER_MONTH * secondRate +
          SECONDS_PER_MONTH * thirdRate +
          (blockTimestamp - epoch3End) * fourthRate) /
          SECONDS_PER_MONTH) *
          (100 / 150) *
          (1 / 3)
      );
      await expect(
        await vaultRewardsContract.connect(await impersonate(vault1.address)).calculateRewards(vault1.address, user1.address)
      ).to.emit(vaultRewardsContract, "RewardsDistributed");
      const user1Rewards = await (await vaultRewardsContract.claimRecords(user1.address)).totalAvailable;
      console.log("diff = %s", user1Rewards.sub(expectedUser1Rewards));
      expect(user1Rewards).to.closeTo(BigNumber.from(expectedUser1Rewards), ONE_UNIT);
    });

    it("vault weight is updated", async () => {
      const start = monthsInSeconds(-0.9);
      const epoch1End = monthsInSeconds(0.1);
      const epoch2End = monthsInSeconds(1.1);
      const epoch3End = monthsInSeconds(2.1);
      const end = monthsInSeconds(119.1);
      const blockTimestamp1 = monthsInSeconds(1.5); // the third month
      const blockTimestamp2 = monthsInSeconds(2.2); // the forth month

      await vaultRewardsContract.setEpochStartTime(start);
      await vaultRewardsContract.setEpochEndTime(end);
      await vaultRewardsContract.setBlocktimestamp(blockTimestamp1);
      await vaultRewardsContract.connect(governance).setPerVaultRewardsWeight([vault1.address, vault2.address], [100, 100]);
      await vaultRewardsContract.setBlocktimestamp(blockTimestamp2);
      const secondRate = INITIAL_RATE * 0.99;
      const thirdRate = secondRate * 0.99;
      const fourthRate = thirdRate * 0.99;

      const expectedUser1Rewards = Math.round(
        (((epoch1End - start) * INITIAL_RATE * (100 / 150) +
          SECONDS_PER_MONTH * secondRate * (100 / 150) +
          (blockTimestamp1 - epoch2End) * thirdRate * (100 / 150) +
          (epoch3End - blockTimestamp1) * thirdRate * (100 / 200) +
          (blockTimestamp2 - epoch3End) * fourthRate * (100 / 200)) /
          SECONDS_PER_MONTH) *
          (1 / 3)
      );
      await expect(
        await vaultRewardsContract.connect(await impersonate(vault1.address)).calculateRewards(vault1.address, user1.address)
      ).to.emit(vaultRewardsContract, "RewardsDistributed");
      const user1Rewards = await (await vaultRewardsContract.claimRecords(user1.address)).totalAvailable;
      console.log("diff = %s", user1Rewards.sub(expectedUser1Rewards));
      expect(user1Rewards).to.closeTo(BigNumber.from(expectedUser1Rewards), ONE_UNIT);
    });

    it("vaults rewards ratio is updated", async () => {
      const start = monthsInSeconds(-0.9);
      const epoch1End = monthsInSeconds(0.1);
      const epoch2End = monthsInSeconds(1.1);
      const epoch3End = monthsInSeconds(2.1);
      const end = monthsInSeconds(119.1);
      const blockTimestamp1 = monthsInSeconds(1.5); // the third month
      const blockTimestamp2 = monthsInSeconds(2.2); // the forth month

      await vaultRewardsContract.setEpochStartTime(start);
      await vaultRewardsContract.setEpochEndTime(end);
      await vaultRewardsContract.setBlocktimestamp(blockTimestamp1);
      await vaultRewardsContract.connect(governance).setVaultsRewardsRatio(5000); // 50% of total emission
      await vaultRewardsContract.setBlocktimestamp(blockTimestamp2);

      const secondRate = INITIAL_RATE * 0.99;
      const thirdRate = secondRate * 0.99;
      const fourthRate = thirdRate * 0.99;

      const expectedUser1Rewards = Math.round(
        (((epoch1End - start) * INITIAL_RATE * (100 / 100) +
          SECONDS_PER_MONTH * secondRate * (100 / 100) +
          (blockTimestamp1 - epoch2End) * thirdRate * (100 / 100) +
          (epoch3End - blockTimestamp1) * thirdRate * (50 / 100) +
          (blockTimestamp2 - epoch3End) * fourthRate * (50 / 100)) /
          SECONDS_PER_MONTH) *
          (100 / 150) *
          (1 / 3)
      );
      await expect(
        await vaultRewardsContract.connect(await impersonate(vault1.address)).calculateRewards(vault1.address, user1.address)
      ).to.emit(vaultRewardsContract, "RewardsDistributed");
      const user1Rewards = await (await vaultRewardsContract.claimRecords(user1.address)).totalAvailable;
      console.log("diff = %s", user1Rewards.sub(expectedUser1Rewards));
      expect(user1Rewards).to.closeTo(BigNumber.from(expectedUser1Rewards), ONE_UNIT);
    });

    it("user add more deposit after the initial deposit", async () => {
      const start = monthsInSeconds(-0.9);
      const epoch1End = monthsInSeconds(0.1);
      const epoch2End = monthsInSeconds(1.1);
      const epoch3End = monthsInSeconds(2.1);
      const end = monthsInSeconds(119.1);
      const blockTimestamp1 = monthsInSeconds(1.5); // the third month
      const blockTimestamp2 = monthsInSeconds(2.2); // the forth month

      await vaultRewardsContract.setEpochStartTime(start);
      await vaultRewardsContract.setEpochEndTime(end);
      await vaultRewardsContract.setBlocktimestamp(blockTimestamp1);
      await vaultRewardsContract.connect(await impersonate(vault1.address)).calculateRewards(vault1.address, user1.address);
      await vault1.mint(user1.address, ethers.utils.parseEther("1"));
      await vaultRewardsContract.setBlocktimestamp(blockTimestamp2);

      const secondRate = INITIAL_RATE * 0.99;
      const thirdRate = secondRate * 0.99;
      const fourthRate = thirdRate * 0.99;

      const expectedUser1Rewards = Math.round(
        (((epoch1End - start) * INITIAL_RATE * (1 / 3) +
          SECONDS_PER_MONTH * secondRate * (1 / 3) +
          (blockTimestamp1 - epoch2End) * thirdRate * (1 / 3) +
          (epoch3End - blockTimestamp1) * thirdRate * (2 / 4) +
          (blockTimestamp2 - epoch3End) * fourthRate * (2 / 4)) /
          SECONDS_PER_MONTH) *
          (100 / 150)
      );
      await expect(
        await vaultRewardsContract.connect(await impersonate(vault1.address)).calculateRewards(vault1.address, user1.address)
      ).to.emit(vaultRewardsContract, "RewardsDistributed");
      const user1Rewards = await (await vaultRewardsContract.claimRecords(user1.address)).totalAvailable;
      console.log("diff = %s", user1Rewards.sub(expectedUser1Rewards));
      expect(user1Rewards).to.closeTo(BigNumber.from(expectedUser1Rewards), ONE_UNIT);
    });

    it("user remove all deposit after the initial deposit", async () => {
      const start = monthsInSeconds(-0.9);
      const epoch1End = monthsInSeconds(0.1);
      const epoch2End = monthsInSeconds(1.1);
      const epoch3End = monthsInSeconds(2.1);
      const end = monthsInSeconds(119.1);
      const blockTimestamp1 = monthsInSeconds(1.5); // the third month
      const blockTimestamp2 = monthsInSeconds(2.2); // the forth month

      await vaultRewardsContract.setEpochStartTime(start);
      await vaultRewardsContract.setEpochEndTime(end);
      await vaultRewardsContract.setBlocktimestamp(blockTimestamp1);
      await vaultRewardsContract.connect(await impersonate(vault1.address)).calculateRewards(vault1.address, user1.address);
      await vault1.connect(user1).burn(ethers.utils.parseEther("1"));
      await vaultRewardsContract.setBlocktimestamp(blockTimestamp2);
      const secondRate = INITIAL_RATE * 0.99;
      const thirdRate = secondRate * 0.99;
      const fourthRate = thirdRate * 0.99;
      const expectedUser1Rewards = Math.round(
        (((epoch1End - start) * INITIAL_RATE * (1 / 3) +
          SECONDS_PER_MONTH * secondRate * (1 / 3) +
          (blockTimestamp1 - epoch2End) * thirdRate * (1 / 3) +
          (epoch3End - blockTimestamp1) * thirdRate * 0 +
          (blockTimestamp2 - epoch3End) * fourthRate * 0) /
          SECONDS_PER_MONTH) *
          (100 / 150)
      );
      await expect(
        await vaultRewardsContract.connect(await impersonate(vault1.address)).calculateRewards(vault1.address, user1.address)
      ).to.emit(vaultRewardsContract, "RewardsDistributed");
      const user1Rewards = await (await vaultRewardsContract.claimRecords(user1.address)).totalAvailable;
      console.log("diff = %s", user1Rewards.sub(expectedUser1Rewards));
      expect(user1Rewards).to.closeTo(BigNumber.from(expectedUser1Rewards), ONE_UNIT);
    });

    it("rewards from all vaults", async () => {
      const start = monthsInSeconds(-0.9);
      const epoch1End = monthsInSeconds(0.1);
      const epoch2End = monthsInSeconds(1.1);
      const epoch3End = monthsInSeconds(2.1);
      const end = monthsInSeconds(119.1);
      const blockTimestamp1 = monthsInSeconds(1.5); // the third month
      const blockTimestamp2 = monthsInSeconds(2.2); // the forth month

      await vaultRewardsContract.setEpochStartTime(start);
      await vaultRewardsContract.setEpochEndTime(end);
      await vaultRewardsContract.setBlocktimestamp(blockTimestamp1);
      await vaultRewardsContract.connect(await impersonate(vault1.address)).calculateRewards(vault1.address, user2.address);
      await vault1.mint(user2.address, ethers.utils.parseEther("1"));
      await vaultRewardsContract.setBlocktimestamp(blockTimestamp2);

      const secondRate = INITIAL_RATE * 0.99;
      const thirdRate = secondRate * 0.99;
      const fourthRate = thirdRate * 0.99;

      const expectedUser2Vault1Rewards = Math.round(
        (((epoch1End - start) * INITIAL_RATE * (2 / 3) +
          SECONDS_PER_MONTH * secondRate * (2 / 3) +
          (blockTimestamp1 - epoch2End) * thirdRate * (2 / 3) +
          (epoch3End - blockTimestamp1) * thirdRate * (3 / 4) +
          (blockTimestamp2 - epoch3End) * fourthRate * (3 / 4)) /
          SECONDS_PER_MONTH) *
          (100 / 150)
      );
      const expectedUser2Vault2Rewards = Math.round(
        (((epoch1End - start) * INITIAL_RATE * (1 / 2) +
          SECONDS_PER_MONTH * secondRate * (1 / 2) +
          (blockTimestamp1 - epoch2End) * thirdRate * (1 / 2) +
          (epoch3End - blockTimestamp1) * thirdRate * (1 / 2) +
          (blockTimestamp2 - epoch3End) * fourthRate * (1 / 2)) /
          SECONDS_PER_MONTH) *
          (50 / 150)
      );
      const expectedUser2Rewards = expectedUser2Vault1Rewards + expectedUser2Vault2Rewards;
      await vaultRewardsContract.connect(await impersonate(vault1.address)).calculateRewards(vault1.address, user2.address);
      await vaultRewardsContract.connect(await impersonate(vault2.address)).calculateRewards(vault2.address, user2.address);
      const user2Rewards = await (await vaultRewardsContract.claimRecords(user2.address)).totalAvailable;
      console.log("diff = %s", user2Rewards.sub(expectedUser2Rewards));
      expect(user2Rewards).to.closeTo(BigNumber.from(expectedUser2Rewards), ONE_UNIT);
    });
  });

  describe("claim && claimAll", async () => {
    let vault1: TokenMock;
    let vault2: TokenMock;
    let rewards: TokenMock;
    let user1Rewards: BigNumber;
    let user2Rewards: BigNumber;

    beforeEach(async () => {
      const TokenMockContract = await ethers.getContractFactory("TokenMock");
      vault1 = (await TokenMockContract.deploy("vaultToken1", "vt1")) as TokenMock;
      await vault1.deployed();
      vault2 = (await TokenMockContract.deploy("vaultToken2", "vt2")) as TokenMock;
      await vault2.deployed();
      const points = [100, 50];
      await vaultRewardsContract.setInitialVaultWeights([vault1.address, vault2.address], points);

      // mint some tokens. This can be treated as user provide liquidity
      await vault1.mint(user1.address, ethers.utils.parseEther("1"));
      await vault1.mint(user2.address, ethers.utils.parseEther("2"));
      await vault2.mint(user2.address, ethers.utils.parseEther("1"));
      await vault2.mint(user3.address, ethers.utils.parseEther("1"));

      rewards = (await TokenMockContract.deploy("reward", "rd")) as TokenMock;
      await rewards.deployed();
      rewards.mint(wallet.address, ethers.utils.parseEther("100000"));
      rewards.connect(wallet).approve(vaultRewardsContract.address, ethers.constants.MaxUint256);

      const start = monthsInSeconds(0);
      const end = monthsInSeconds(120);
      const blockTimestamp = monthsInSeconds(1); // the end of first month

      await vaultRewardsContract.setEpochStartTime(start);
      await vaultRewardsContract.setEpochEndTime(end);
      await vaultRewardsContract.setBlocktimestamp(blockTimestamp);
      await vaultRewardsContract.setRewardAddress(rewards.address);

      user1Rewards = BigNumber.from(Math.round(INITIAL_RATE * (1 / 3) * (100 / 150)));
      const user2Vault1Rewards = BigNumber.from(Math.round(INITIAL_RATE * (2 / 3) * (100 / 150)));
      const uesr2Vault2Rewards = BigNumber.from(Math.round(INITIAL_RATE * (1 / 2) * (50 / 150)));
      user2Rewards = user2Vault1Rewards.add(uesr2Vault2Rewards);
    });

    describe("claim", async () => {
      it("should revert when nothing to claim", async () => {
        await expect(vaultRewardsContract.claim([vault2.address], user1.address)).to.be.revertedWith("nothing to claim");
      });
      it("should revert when vaults are not empty", async () => {
        await expect(vaultRewardsContract.claim([], user1.address)).to.be.revertedWith("no vaults");
      });
      it("allow users to claim all their rewards in a single vault", async () => {
        let balance = await rewards.balanceOf(user1.address);
        await expect(balance).to.equal(0);
        await vaultRewardsContract.connect(user1).claim([vault1.address], user1.address);
        balance = await rewards.balanceOf(user1.address);
        const totalRewards = (await vaultRewardsContract.claimRecords(user1.address)).totalAvailable;
        expect(balance.toNumber()).to.be.greaterThan(0);
        expect(balance).to.equal(totalRewards);
        expect(balance).to.be.closeTo(user1Rewards, ONE_UNIT);
      });
      it("allow users to claim all their rewards in all vaults", async () => {
        let balance = await rewards.balanceOf(user2.address);
        await expect(balance).to.equal(0);
        await vaultRewardsContract.connect(user2).claim([vault1.address, vault2.address], user2.address);
        balance = await rewards.balanceOf(user2.address);
        const totalRewards = (await vaultRewardsContract.claimRecords(user2.address)).totalAvailable;
        expect(balance.toNumber()).to.be.greaterThan(0);
        expect(balance).to.equal(totalRewards);
        expect(balance).to.be.closeTo(user2Rewards, ONE_UNIT);
      });

      it("user can claim rewards many times", async () => {
        let balance = await rewards.balanceOf(user1.address);
        await expect(balance).to.equal(0);
        await vaultRewardsContract.connect(user1).claim([vault1.address], user1.address);
        balance = await rewards.balanceOf(user1.address);
        let totalRewards = (await vaultRewardsContract.claimRecords(user1.address)).totalAvailable;
        expect(balance.toNumber()).to.be.greaterThan(0);
        expect(balance).to.equal(totalRewards);
        expect(balance).to.be.closeTo(user1Rewards, ONE_UNIT);
        let claimed = (await vaultRewardsContract.claimRecords(user1.address)).totalClaimed;
        expect(balance).to.equal(claimed);

        await vaultRewardsContract.setBlocktimestamp(monthsInSeconds(2));
        const additionalRewards = BigNumber.from(Math.round(INITIAL_RATE * 0.99 * (1 / 3) * (100 / 150)));
        await vaultRewardsContract.connect(await impersonate(vault1.address)).calculateRewards(vault1.address, user1.address);
        totalRewards = (await vaultRewardsContract.claimRecords(user1.address)).totalAvailable;
        claimed = (await vaultRewardsContract.claimRecords(user1.address)).totalClaimed;
        expect(totalRewards.sub(claimed)).to.be.closeTo(additionalRewards, ONE_UNIT);
        await vaultRewardsContract.connect(user1).claim([vault1.address], user1.address);
        balance = await rewards.balanceOf(user1.address);
        expect(totalRewards).to.be.closeTo(user1Rewards.add(additionalRewards), ONE_UNIT);
        expect(balance).to.equal(totalRewards);
      });
    });

    describe("claim all", async () => {
      it("allow users to claim all their rewards in all vaults", async () => {
        let balance = await rewards.balanceOf(user2.address);
        await expect(balance).to.equal(0);
        await vaultRewardsContract.connect(user2).claimAll(user2.address);
        balance = await rewards.balanceOf(user2.address);
        const totalRewards = (await vaultRewardsContract.claimRecords(user2.address)).totalAvailable;
        expect(balance.toNumber()).to.be.greaterThan(0);
        expect(balance).to.equal(totalRewards);
        expect(balance).to.be.closeTo(user2Rewards, ONE_UNIT);
      });
    });

    describe("allUnclaimedRewards", async () => {
      it("should return the right amount", async () => {
        const unclaimed = await vaultRewardsContract.connect(user2).allUnclaimedRewards();
        expect(unclaimed).to.be.closeTo(user2Rewards, ONE_UNIT);
      });
    });

    describe("unclaimedRewards", async () => {
      it("should return the right amount", async () => {
        const unclaimed = await vaultRewardsContract.connect(user1).unclaimedRewards([vault1.address, vault2.address]);
        expect(unclaimed).to.be.closeTo(user1Rewards, ONE_UNIT);
      });
    });
  });
});
