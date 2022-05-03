import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ContractFactory } from "ethers";
import { ethers, upgrades, waffle } from "hardhat";
import { YOPRewardsMock } from "../../../types/YOPRewardsMock";
import { daysInSeconds, monthsInSeconds, nowInSeconds, SECONDS_PER_MONTH } from "../utils/time";
import { TokenMock } from "../../../types/TokenMock";
import { impersonate } from "../utils/Impersonate";
import { YOPRewards } from "../../../types/YOPRewards";
import { MockContract } from "ethereum-waffle";
import stakingABI from "../../../abi/contracts/staking/Staking.sol/Staking.json";

const { deployMockContract } = waffle;

const YOP_CONTRACT_ADDRESS = "0xAE1eaAE3F627AAca434127644371b67B18444051";
const EPOCH_START_TIME = 1640995200; // 2022-1-1-00:00:00 GMT

describe("YOPReward", () => {
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let wallet: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let YOPRewards: ContractFactory;
  let yopRewardsContract: YOPRewardsMock;
  let stakingContract: MockContract;

  const INITIAL_RATE = 34255400000000;
  const ONE_UNIT = 100000000;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, wallet, user1, user2, user3] = await ethers.getSigners();
    YOPRewards = await ethers.getContractFactory("YOPRewardsMock");
    yopRewardsContract = (await YOPRewards.deploy()) as YOPRewardsMock;
    await yopRewardsContract.deployed();
    await yopRewardsContract.initialize(governance.address, gatekeeper.address, wallet.address, YOP_CONTRACT_ADDRESS, EPOCH_START_TIME);
    stakingContract = await deployMockContract(deployer, stakingABI);
    await yopRewardsContract.connect(governance).setStakingContractAddress(stakingContract.address);
    await stakingContract.mock.totalWorkingSupply.returns(0);
    await stakingContract.mock.workingBalanceOfStake.returns(0);
    await stakingContract.mock.stakesFor.returns([]);
  });

  describe("initialize", async () => {
    it("should fail if input data is not valid", async () => {
      const mock = (await YOPRewards.deploy()) as YOPRewardsMock;
      expect(
        mock.initialize(governance.address, gatekeeper.address, ethers.constants.AddressZero, YOP_CONTRACT_ADDRESS, EPOCH_START_TIME)
      ).to.be.revertedWith("invalid wallet address");

      expect(
        mock.initialize(governance.address, gatekeeper.address, wallet.address, ethers.constants.AddressZero, EPOCH_START_TIME)
      ).to.be.revertedWith("invalid yop contract address");

      expect(mock.initialize(governance.address, gatekeeper.address, wallet.address, YOP_CONTRACT_ADDRESS, 0)).to.be.revertedWith(
        "invalid emission start time"
      );
    });

    it("can't be called more than once", async () => {
      const mock = (await YOPRewards.deploy()) as YOPRewardsMock;
      await mock.initialize(governance.address, gatekeeper.address, wallet.address, YOP_CONTRACT_ADDRESS, EPOCH_START_TIME);
      expect(mock.initialize(governance.address, gatekeeper.address, wallet.address, YOP_CONTRACT_ADDRESS, EPOCH_START_TIME)).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
    });
  });

  describe("rate", async () => {
    it("should return 0 when emission is not started", async () => {
      const startTime = daysInSeconds(1);
      await yopRewardsContract.setEpochStartTime(startTime);
      await yopRewardsContract.setBlocktimestamp(nowInSeconds());
      expect(await yopRewardsContract.rate()).to.deep.equal([ethers.constants.Zero, ethers.constants.Zero]);
    });
    it("should return 0 when emission has stopped", async () => {
      const startTime = daysInSeconds(-2); // two days ago
      const endTime = daysInSeconds(-1); // 1 day ago;
      await yopRewardsContract.setEpochStartTime(startTime);
      await yopRewardsContract.setEpochEndTime(endTime);
      await yopRewardsContract.setBlocktimestamp(nowInSeconds());
      expect(await yopRewardsContract.rate()).to.deep.equal([ethers.constants.Zero, ethers.constants.Zero]);
    });
    it("should return the correct rate and epoch value for the first epoch", async () => {
      const startTime = monthsInSeconds(-0.5);
      const endTime = monthsInSeconds(119);
      await yopRewardsContract.setEpochStartTime(startTime);
      await yopRewardsContract.setEpochEndTime(endTime);
      await yopRewardsContract.setBlocktimestamp(nowInSeconds());
      const rate = await yopRewardsContract.rate();
      expect(rate[0]).to.equal(BigNumber.from(INITIAL_RATE));
      expect(rate[1]).to.equal(ethers.constants.One);
    });
    it("should return the correct rate and epoch value for the last epoch", async () => {
      const startTime = monthsInSeconds(-119.5);
      const endTime = monthsInSeconds(0.5);
      await yopRewardsContract.setEpochStartTime(startTime);
      await yopRewardsContract.setEpochEndTime(endTime);
      await yopRewardsContract.setBlocktimestamp(nowInSeconds());
      const rate = await yopRewardsContract.rate();
      const expected = BigNumber.from("10358983000000");
      expect(rate[0]).to.be.closeTo(expected, ONE_UNIT); // the difference is no more than 0.1 YOP
      expect(rate[1]).to.equal(BigNumber.from(120));
    });
    it("should return the correct rate in a consecutive epochs", async () => {
      const startTime = monthsInSeconds(-0.5);
      const endTime = monthsInSeconds(119);
      let currentTime = nowInSeconds();
      await yopRewardsContract.setEpochStartTime(startTime);
      await yopRewardsContract.setEpochEndTime(endTime);
      await yopRewardsContract.setBlocktimestamp(currentTime);
      // this will make sure to calculate the rate based on the current stored epoch value
      await yopRewardsContract.updateCurrentEpoch();
      let rate = await yopRewardsContract.rate();
      expect(rate[0]).to.equal(BigNumber.from(INITIAL_RATE));
      expect(rate[1]).to.equal(ethers.constants.One);
      currentTime = monthsInSeconds(2);
      await yopRewardsContract.setBlocktimestamp(currentTime);
      rate = await yopRewardsContract.rate();
      expect(rate[0]).to.equal(BigNumber.from(INITIAL_RATE * 0.99 * 0.99));
      expect(rate[1]).to.equal(BigNumber.from(3));
    });
  });

  describe("setRewardWallet", async () => {
    it("can not be set by unauthorized", async () => {
      await expect(yopRewardsContract.connect(governance).setRewardWallet(ethers.constants.AddressZero)).to.be.revertedWith("!wallet");
      await expect(yopRewardsContract.setRewardWallet(user3.address)).to.be.revertedWith("governance only");
      let addr = await yopRewardsContract.rewardsWallet();
      expect(addr).to.equal(wallet.address);
      await yopRewardsContract.connect(governance).setRewardWallet(user3.address);
      addr = await yopRewardsContract.rewardsWallet();
      expect(addr).to.equal(user3.address);
    });
  });

  describe("setStakingContractAddress", async () => {
    it("should revert if user is not governance", async () => {
      await expect(yopRewardsContract.setStakingContractAddress(wallet.address)).to.be.revertedWith("governance only");
    });

    it("contract address needs to be valid", async () => {
      await expect(yopRewardsContract.connect(governance).setStakingContractAddress(ethers.constants.AddressZero)).to.be.revertedWith(
        "!address"
      );
    });

    it("should revert if contract address is the same", async () => {
      await expect(yopRewardsContract.connect(governance).setStakingContractAddress(stakingContract.address)).to.be.revertedWith("!valid");
    });

    it("should emit event when staking contract is updated", async () => {
      const anotherContract = await deployMockContract(deployer, stakingABI);
      await expect(yopRewardsContract.connect(governance).setStakingContractAddress(anotherContract.address))
        .to.emit(yopRewardsContract, "StakingContractUpdated")
        .withArgs(anotherContract.address);
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
      await expect(yopRewardsContract.connect(user1).setPerVaultRewardsWeight(vaults, points)).to.be.revertedWith("governance only");
    });

    it("should revert if vaults array is empty", async () => {
      await expect(yopRewardsContract.connect(governance).setPerVaultRewardsWeight([], [])).to.be.revertedWith("!vaults");
    });

    it("should revert if total weight is 0", async () => {
      // set some initial value
      await yopRewardsContract.connect(governance).setPerVaultRewardsWeight(vaults, [0, 100]);
      // reset the weight for one of the vault to make total become 0, and that should not be allowed
      await expect(yopRewardsContract.connect(governance).setPerVaultRewardsWeight([vaults[1]], [0])).to.be.revertedWith("!totalWeight");
    });

    it("can only be set by governance", async () => {
      const points = [100, 80];
      expect(await yopRewardsContract.totalWeightForVaults()).to.equal(0);
      await expect(await yopRewardsContract.connect(governance).setPerVaultRewardsWeight(vaults, points))
        .to.emit(yopRewardsContract, "VaultRewardWeightUpdated")
        .withArgs(vaults, points);
      expect(await yopRewardsContract.totalWeightForVaults()).to.equal(180);
      expect(await yopRewardsContract.perVaultRewardsWeight(vault1.address)).to.equal(points[0]);
      expect(await yopRewardsContract.perVaultRewardsWeight(vault2.address)).to.equal(points[1]);
    });

    it("the length of input arrays should be the same", async () => {
      const points = [100, 80];
      await expect(yopRewardsContract.connect(governance).setPerVaultRewardsWeight([vault1.address], points)).to.be.revertedWith("!sameLength");
    });

    it("should have no rewards when vault weights are not set", async () => {
      expect(await yopRewardsContract.connect(user1).unclaimedVaultRewards(user1.address, [vault1.address, vault2.address])).to.equal(0);
    });

    it("should revert if a vault doesn't implement the IVault interface", async () => {
      await expect(
        yopRewardsContract.connect(governance).setPerVaultRewardsWeight([vault1.address, user1.address], [100, 80])
      ).to.be.revertedWith("!vault interface");
    });

    it("should be able to setPerVaultRewardsWeight on new yop rewards contract", async () => {
      const newYopRewards = (await YOPRewards.deploy()) as YOPRewardsMock;
      await newYopRewards.deployed();
      await newYopRewards.initialize(governance.address, gatekeeper.address, wallet.address, YOP_CONTRACT_ADDRESS, EPOCH_START_TIME);
      await expect(await newYopRewards.connect(governance).setPerVaultRewardsWeight(vaults, [100, 80])).to.emit(
        newYopRewards,
        "VaultRewardWeightUpdated"
      );
    });
  });

  describe("setRewardsAllocationWeights", async () => {
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
      await yopRewardsContract.connect(governance).setPerVaultRewardsWeight(vaults, points);
    });

    it("can not be set by non-governance", async () => {
      await expect(yopRewardsContract.connect(user1).setRewardsAllocationWeights(100, 9900)).to.be.revertedWith("governance only");
    });

    it("total weight can't be 0", async () => {
      await expect(yopRewardsContract.connect(governance).setRewardsAllocationWeights(0, 0)).to.be.revertedWith("invalid ratio");
    });

    it("should not update weight if value is the same", async () => {
      await expect(await yopRewardsContract.connect(governance).setRewardsAllocationWeights(50, 50)).not.to.emit(
        yopRewardsContract,
        "VaultsRewardsWeightUpdated"
      );
    });

    it("can only be set by governance", async () => {
      expect(await yopRewardsContract.vaultsRewardsWeight()).to.equal(50);
      const ratio = 10000;
      await expect(await yopRewardsContract.connect(governance).setRewardsAllocationWeights(ratio, 0))
        .to.emit(yopRewardsContract, "VaultsRewardsWeightUpdated")
        .withArgs(ratio);
      expect(await yopRewardsContract.vaultsRewardsWeight()).to.equal(ratio);
    });

    it("can set even if staking contract is not set", async () => {
      const newYopRewards = (await YOPRewards.deploy()) as YOPRewardsMock;
      await newYopRewards.deployed();
      await newYopRewards.initialize(governance.address, gatekeeper.address, wallet.address, YOP_CONTRACT_ADDRESS, EPOCH_START_TIME);
      await expect(await newYopRewards.connect(governance).setRewardsAllocationWeights(1000, 0)).not.to.emit(
        newYopRewards,
        "StakingRewardsWeightUpdated"
      );
    });
  });

  describe("calculateVaultRewards", async () => {
    let vault1: TokenMock;
    let vault2: TokenMock;

    beforeEach(async () => {
      const TokenMockContract = await ethers.getContractFactory("TokenMock");
      vault1 = (await TokenMockContract.deploy("vaultToken1", "vt1")) as TokenMock;
      await vault1.deployed();
      vault2 = (await TokenMockContract.deploy("vaultToken2", "vt2")) as TokenMock;
      await vault2.deployed();
      const points = [100, 50];
      await yopRewardsContract.setInitialRewardsRatios(10000, 0);
      await yopRewardsContract.setInitialVaultWeights([vault1.address, vault2.address], points);

      // mint some tokens. This can be treated as user provide liquidity
      await vault1.mint(user1.address, ethers.utils.parseEther("1"));
      await vault1.mint(user2.address, ethers.utils.parseEther("2"));
      await vault2.mint(user2.address, ethers.utils.parseEther("1"));
      await vault2.mint(user3.address, ethers.utils.parseEther("1"));
    });

    it("can not be called by unauthorised", async () => {
      await expect(yopRewardsContract.connect(user1).calculateVaultRewards(user1.address)).to.be.revertedWith("not authorised");
      await expect(yopRewardsContract.connect(await impersonate(vault1.address)).calculateVaultRewards(user1.address)).not.to.be.reverted;
    });

    it("inside the same epoch", async () => {
      const start = monthsInSeconds(-0.5);
      const end = monthsInSeconds(119.5);
      const now = nowInSeconds();
      await yopRewardsContract.setEpochStartTime(start);
      await yopRewardsContract.setEpochEndTime(end);
      await yopRewardsContract.setBlocktimestamp(now); // within the first month
      const expectedVaultRewards = BigNumber.from(now).sub(BigNumber.from(start)).mul(INITIAL_RATE).mul(100).div(SECONDS_PER_MONTH).div(150);
      const expectedUser1Rewards = expectedVaultRewards.div(3);
      await expect(await yopRewardsContract.connect(await impersonate(vault1.address)).calculateVaultRewards(user1.address)).to.emit(
        yopRewardsContract,
        "RewardsDistributed"
      );
      const user1Rewards = await (await yopRewardsContract.claimRecordForAddress(user1.address)).totalAvailable;
      console.log("diff = %s", user1Rewards.sub(expectedUser1Rewards));
      expect(user1Rewards).to.closeTo(BigNumber.from(expectedUser1Rewards), ONE_UNIT); // within 0.1 token
      // check vault total rewards
      const vaultRewards = (await yopRewardsContract.poolRewardsState(vault1.address)).totalRewards;
      expect(vaultRewards).to.closeTo(BigNumber.from(expectedVaultRewards), ONE_UNIT);
    });

    it("start and end inside two consecutive epochs", async () => {
      const start = monthsInSeconds(-0.9);
      const epochEnd = monthsInSeconds(0.1);
      const end = monthsInSeconds(119.1);
      const blockTimestamp = monthsInSeconds(0.2); // the second month

      await yopRewardsContract.setEpochStartTime(start);
      await yopRewardsContract.setEpochEndTime(end);
      await yopRewardsContract.setBlocktimestamp(blockTimestamp);

      const secondRate = INITIAL_RATE * 0.99;
      const expectedVaultRewards =
        (((epochEnd - start) * INITIAL_RATE + (blockTimestamp - epochEnd) * secondRate) / SECONDS_PER_MONTH) * (100 / 150);
      const expectedUser1Rewards = Math.round(expectedVaultRewards * (1 / 3));
      await expect(await yopRewardsContract.connect(await impersonate(vault1.address)).calculateVaultRewards(user1.address)).to.emit(
        yopRewardsContract,
        "RewardsDistributed"
      );
      const user1Rewards = await (await yopRewardsContract.claimRecordForAddress(user1.address)).totalAvailable;
      console.log("diff = %s", user1Rewards.sub(expectedUser1Rewards));
      expect(user1Rewards).to.closeTo(BigNumber.from(expectedUser1Rewards), ONE_UNIT);
      const actualVaultRewards = (await yopRewardsContract.poolRewardsState(vault1.address)).totalRewards;
      expect(actualVaultRewards).to.closeTo(BigNumber.from(Math.round(expectedVaultRewards)), ONE_UNIT);
    });

    it("start and end in non-consecutive epochs", async () => {
      const start = monthsInSeconds(-0.9);
      const epoch1End = monthsInSeconds(0.1);
      const epoch2End = monthsInSeconds(1.1);
      const epoch3End = monthsInSeconds(2.1);
      const end = monthsInSeconds(119.1);
      const blockTimestamp = monthsInSeconds(2.2); // the forth month

      await yopRewardsContract.setEpochStartTime(start);
      await yopRewardsContract.setEpochEndTime(end);
      await yopRewardsContract.setBlocktimestamp(blockTimestamp);

      const secondRate = INITIAL_RATE * 0.99;
      const thirdRate = secondRate * 0.99;
      const fourthRate = thirdRate * 0.99;

      const expectedVaultRewards =
        (((epoch1End - start) * INITIAL_RATE +
          SECONDS_PER_MONTH * secondRate +
          SECONDS_PER_MONTH * thirdRate +
          (blockTimestamp - epoch3End) * fourthRate) /
          SECONDS_PER_MONTH) *
        (100 / 150);

      const expectedUser1Rewards = Math.round(expectedVaultRewards * (1 / 3));
      await expect(await yopRewardsContract.connect(await impersonate(vault1.address)).calculateVaultRewards(user1.address)).to.emit(
        yopRewardsContract,
        "RewardsDistributed"
      );
      const user1Rewards = await (await yopRewardsContract.claimRecordForAddress(user1.address)).totalAvailable;
      console.log("diff = %s", user1Rewards.sub(expectedUser1Rewards));
      expect(user1Rewards).to.closeTo(BigNumber.from(expectedUser1Rewards), ONE_UNIT);
      const actualVaultRewards = (await yopRewardsContract.poolRewardsState(vault1.address)).totalRewards;
      expect(actualVaultRewards).to.closeTo(BigNumber.from(Math.round(expectedVaultRewards)), ONE_UNIT);
    });

    it("vault weight is updated", async () => {
      const start = monthsInSeconds(-0.9);
      const epoch1End = monthsInSeconds(0.1);
      const epoch2End = monthsInSeconds(1.1);
      const epoch3End = monthsInSeconds(2.1);
      const end = monthsInSeconds(119.1);
      const blockTimestamp1 = monthsInSeconds(1.5); // the third month
      const blockTimestamp2 = monthsInSeconds(2.2); // the forth month

      await yopRewardsContract.setEpochStartTime(start);
      await yopRewardsContract.setEpochEndTime(end);
      await yopRewardsContract.setBlocktimestamp(blockTimestamp1);
      await yopRewardsContract.connect(governance).setPerVaultRewardsWeight([vault1.address, vault2.address], [100, 100]);
      await yopRewardsContract.setBlocktimestamp(blockTimestamp2);
      const secondRate = INITIAL_RATE * 0.99;
      const thirdRate = secondRate * 0.99;
      const fourthRate = thirdRate * 0.99;

      const expectedVaultRewards =
        ((epoch1End - start) * INITIAL_RATE * (100 / 150) +
          SECONDS_PER_MONTH * secondRate * (100 / 150) +
          (blockTimestamp1 - epoch2End) * thirdRate * (100 / 150) +
          (epoch3End - blockTimestamp1) * thirdRate * (100 / 200) +
          (blockTimestamp2 - epoch3End) * fourthRate * (100 / 200)) /
        SECONDS_PER_MONTH;

      const expectedUser1Rewards = Math.round(expectedVaultRewards * (1 / 3));
      await expect(await yopRewardsContract.connect(await impersonate(vault1.address)).calculateVaultRewards(user1.address)).to.emit(
        yopRewardsContract,
        "RewardsDistributed"
      );
      const user1Rewards = await (await yopRewardsContract.claimRecordForAddress(user1.address)).totalAvailable;
      console.log("diff = %s", user1Rewards.sub(expectedUser1Rewards));
      expect(user1Rewards).to.closeTo(BigNumber.from(expectedUser1Rewards), ONE_UNIT);
      const actualVaultRewards = (await yopRewardsContract.poolRewardsState(vault1.address)).totalRewards;
      expect(actualVaultRewards).to.closeTo(BigNumber.from(Math.round(expectedVaultRewards)), ONE_UNIT);
    });

    it("vaults rewards ratio is updated", async () => {
      const start = monthsInSeconds(-0.9);
      const epoch1End = monthsInSeconds(0.1);
      const epoch2End = monthsInSeconds(1.1);
      const epoch3End = monthsInSeconds(2.1);
      const end = monthsInSeconds(119.1);
      const blockTimestamp1 = monthsInSeconds(1.5); // the third month
      const blockTimestamp2 = monthsInSeconds(2.2); // the forth month

      await yopRewardsContract.setEpochStartTime(start);
      await yopRewardsContract.setEpochEndTime(end);
      await yopRewardsContract.setBlocktimestamp(blockTimestamp1);
      await yopRewardsContract.connect(governance).setRewardsAllocationWeights(5000, 5000); // 50% of total emission
      await yopRewardsContract.setBlocktimestamp(blockTimestamp2);

      const secondRate = INITIAL_RATE * 0.99;
      const thirdRate = secondRate * 0.99;
      const fourthRate = thirdRate * 0.99;

      const expectedVaultRewards =
        (((epoch1End - start) * INITIAL_RATE * (100 / 100) +
          SECONDS_PER_MONTH * secondRate * (100 / 100) +
          (blockTimestamp1 - epoch2End) * thirdRate * (100 / 100) +
          (epoch3End - blockTimestamp1) * thirdRate * (50 / 100) +
          (blockTimestamp2 - epoch3End) * fourthRate * (50 / 100)) /
          SECONDS_PER_MONTH) *
        (100 / 150);

      const expectedUser1Rewards = Math.round(expectedVaultRewards * (1 / 3));
      await expect(await yopRewardsContract.connect(await impersonate(vault1.address)).calculateVaultRewards(user1.address)).to.emit(
        yopRewardsContract,
        "RewardsDistributed"
      );
      const user1Rewards = await (await yopRewardsContract.claimRecordForAddress(user1.address)).totalAvailable;
      console.log("diff = %s", user1Rewards.sub(expectedUser1Rewards));
      expect(user1Rewards).to.closeTo(BigNumber.from(expectedUser1Rewards), ONE_UNIT);
      const actualVaultRewards = (await yopRewardsContract.poolRewardsState(vault1.address)).totalRewards;
      expect(actualVaultRewards).to.closeTo(BigNumber.from(Math.round(expectedVaultRewards)), ONE_UNIT);
    });

    it("user add more deposit after the initial deposit", async () => {
      const start = monthsInSeconds(-0.9);
      const epoch1End = monthsInSeconds(0.1);
      const epoch2End = monthsInSeconds(1.1);
      const epoch3End = monthsInSeconds(2.1);
      const end = monthsInSeconds(119.1);
      const blockTimestamp1 = monthsInSeconds(1.5); // the third month
      const blockTimestamp2 = monthsInSeconds(2.2); // the forth month

      await yopRewardsContract.setEpochStartTime(start);
      await yopRewardsContract.setEpochEndTime(end);
      await yopRewardsContract.setBlocktimestamp(blockTimestamp1);
      await yopRewardsContract.connect(await impersonate(vault1.address)).calculateVaultRewards(user1.address);
      await vault1.mint(user1.address, ethers.utils.parseEther("1"));
      await yopRewardsContract.setBlocktimestamp(blockTimestamp2);

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
      await expect(await yopRewardsContract.connect(await impersonate(vault1.address)).calculateVaultRewards(user1.address)).to.emit(
        yopRewardsContract,
        "RewardsDistributed"
      );
      const user1Rewards = await (await yopRewardsContract.claimRecordForAddress(user1.address)).totalAvailable;
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

      await yopRewardsContract.setEpochStartTime(start);
      await yopRewardsContract.setEpochEndTime(end);
      await yopRewardsContract.setBlocktimestamp(blockTimestamp1);
      await yopRewardsContract.connect(await impersonate(vault1.address)).calculateVaultRewards(user1.address);
      await vault1.connect(user1).burn(ethers.utils.parseEther("1"));
      await yopRewardsContract.setBlocktimestamp(blockTimestamp2);
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
      // between now and the last time `calculateVaultRewards` is called, the user has no balance in vault so this time there won't be any rewards available to the user
      await expect(yopRewardsContract.connect(await impersonate(vault1.address)).calculateVaultRewards(user1.address)).not.to.be.reverted;
      const user1Rewards = await (await yopRewardsContract.claimRecordForAddress(user1.address)).totalAvailable;
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

      await yopRewardsContract.setEpochStartTime(start);
      await yopRewardsContract.setEpochEndTime(end);
      await yopRewardsContract.setBlocktimestamp(blockTimestamp1);
      await yopRewardsContract.connect(await impersonate(vault1.address)).calculateVaultRewards(user2.address);
      await vault1.mint(user2.address, ethers.utils.parseEther("1"));
      await yopRewardsContract.setBlocktimestamp(blockTimestamp2);

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
      await yopRewardsContract.connect(await impersonate(vault1.address)).calculateVaultRewards(user2.address);
      await yopRewardsContract.connect(await impersonate(vault2.address)).calculateVaultRewards(user2.address);
      const user2Rewards = await (await yopRewardsContract.claimRecordForAddress(user2.address)).totalAvailable;
      console.log("diff = %s", user2Rewards.sub(expectedUser2Rewards));
      expect(user2Rewards).to.closeTo(BigNumber.from(expectedUser2Rewards), ONE_UNIT);
    });

    it("totalRewardsForPool", async () => {
      await yopRewardsContract.setInitialRewardsRatios(5000, 5000);
      await stakingContract.mock.totalWorkingSupply.returns(ONE_UNIT);
      const start = monthsInSeconds(-0.5);
      const end = monthsInSeconds(119.5);
      const now = nowInSeconds();
      await yopRewardsContract.setEpochStartTime(start);
      await yopRewardsContract.setEpochEndTime(end);
      await yopRewardsContract.setBlocktimestamp(now); // within the first month
      const expectedVaultRewards = BigNumber.from(now)
        .sub(BigNumber.from(start))
        .mul(INITIAL_RATE)
        .mul(100)
        .div(SECONDS_PER_MONTH)
        .div(150)
        .div(2);
      const expectedStakingRewards = BigNumber.from(now).sub(BigNumber.from(start)).mul(INITIAL_RATE).div(SECONDS_PER_MONTH).div(2);
      // check vault total rewards
      const vaultRewards = await yopRewardsContract.totalRewardsForVault(vault1.address);
      expect(vaultRewards).to.closeTo(BigNumber.from(expectedVaultRewards), ONE_UNIT);
      const stakingRewards = await yopRewardsContract.totalRewardsForStaking();
      expect(stakingRewards).to.closeTo(BigNumber.from(expectedStakingRewards), ONE_UNIT);
    });
  });

  describe("calculateStakingRewards", async () => {
    beforeEach(async () => {
      await stakingContract.mock.totalWorkingSupply.returns(ONE_UNIT * 100);
      await stakingContract.mock.workingBalanceOfStake.withArgs(0).returns(ONE_UNIT * 100 * 0.3);
      await stakingContract.mock.workingBalanceOfStake.withArgs(1).returns(ONE_UNIT * 100 * 0.7);
      await yopRewardsContract.setInitialRewardsRatios(0, 10000);
    });

    it("should revert if not called by the staking contract", async () => {
      await expect(yopRewardsContract.connect(governance).calculateStakingRewards(0)).to.be.revertedWith("!authorised");
    });

    it("should update the rewards amount", async () => {
      const start = monthsInSeconds(-0.5);
      const end = monthsInSeconds(119.5);
      const now = nowInSeconds();
      await yopRewardsContract.setEpochStartTime(start);
      await yopRewardsContract.setEpochEndTime(end);
      await yopRewardsContract.setBlocktimestamp(now); // within the first month
      const expectedStakingRewards = BigNumber.from(now).sub(BigNumber.from(start)).mul(INITIAL_RATE).div(SECONDS_PER_MONTH);
      const expectedRewardsForStake0 = expectedStakingRewards.mul(3).div(10);
      await expect(await yopRewardsContract.connect(await impersonate(stakingContract.address)).calculateStakingRewards(0)).to.emit(
        yopRewardsContract,
        "RewardsDistributed"
      );
      const stake0Rewards = await (await yopRewardsContract.claimRecordForStake(0)).totalAvailable;
      console.log("diff = %s", stake0Rewards.sub(expectedRewardsForStake0));
      expect(stake0Rewards).to.closeTo(BigNumber.from(expectedRewardsForStake0), ONE_UNIT); // within 0.1 token
      // check staking total rewards
      const stakeRewards = (await yopRewardsContract.poolRewardsState(stakingContract.address)).totalRewards;
      expect(stakeRewards).to.closeTo(BigNumber.from(expectedStakingRewards), ONE_UNIT);
    });
  });

  describe("claim", async () => {
    let vault1: TokenMock;
    let vault2: TokenMock;
    let vault3: TokenMock;
    let rewards: TokenMock;
    let user1VaultRewards: BigNumber;
    let user2VaultRewards: BigNumber;
    let user1StakingRewards: BigNumber;
    let user2StakingRewards: BigNumber;
    let user2TotalRewards: BigNumber;

    beforeEach(async () => {
      const TokenMockContract = await ethers.getContractFactory("TokenMock");
      vault1 = (await TokenMockContract.deploy("vaultToken1", "vt1")) as TokenMock;
      await vault1.deployed();
      vault2 = (await TokenMockContract.deploy("vaultToken2", "vt2")) as TokenMock;
      await vault2.deployed();
      vault3 = (await TokenMockContract.deploy("vaultToken3", "vt3")) as TokenMock;
      await vault3.deployed();
      const points = [100, 50, 0];
      await yopRewardsContract.setInitialVaultWeights([vault1.address, vault2.address, vault3.address], points);
      await yopRewardsContract.setInitialRewardsRatios(5000, 5000);
      await stakingContract.mock.totalWorkingSupply.returns(ONE_UNIT);
      await stakingContract.mock.workingBalanceOfStake.withArgs(0).returns(ONE_UNIT * 0.3);
      await stakingContract.mock.workingBalanceOfStake.withArgs(1).returns(ONE_UNIT * 0.7);
      await stakingContract.mock.stakesFor.withArgs(user1.address).returns([0]);
      await stakingContract.mock.stakesFor.withArgs(user2.address).returns([1]);

      // mint some tokens. This can be treated as user provide liquidity
      await vault1.mint(user1.address, ethers.utils.parseEther("1"));
      await vault1.mint(user2.address, ethers.utils.parseEther("2"));
      await vault2.mint(user2.address, ethers.utils.parseEther("1"));
      await vault2.mint(user3.address, ethers.utils.parseEther("1"));

      rewards = (await TokenMockContract.deploy("reward", "rd")) as TokenMock;
      await rewards.deployed();
      rewards.mint(wallet.address, ethers.utils.parseEther("100000"));
      rewards.connect(wallet).approve(yopRewardsContract.address, ethers.constants.MaxUint256);

      const start = monthsInSeconds(0);
      const end = monthsInSeconds(120);
      const blockTimestamp = monthsInSeconds(1); // the end of first month

      await yopRewardsContract.setEpochStartTime(start);
      await yopRewardsContract.setEpochEndTime(end);
      await yopRewardsContract.setBlocktimestamp(blockTimestamp);
      await yopRewardsContract.setRewardAddress(rewards.address);

      user1VaultRewards = BigNumber.from(Math.round((INITIAL_RATE * (1 / 3) * (100 / 150)) / 2));
      const user2Vault1Rewards = BigNumber.from(Math.round((INITIAL_RATE * (2 / 3) * (100 / 150)) / 2));
      const uesr2Vault2Rewards = BigNumber.from(Math.round((INITIAL_RATE * (1 / 2) * (50 / 150)) / 2));
      user2VaultRewards = user2Vault1Rewards.add(uesr2Vault2Rewards);
      user1StakingRewards = BigNumber.from(Math.round((INITIAL_RATE / 2) * 0.3));
      user2StakingRewards = BigNumber.from(Math.round((INITIAL_RATE / 2) * 0.7));
      user2TotalRewards = user2VaultRewards.add(user2StakingRewards);
    });

    describe("claimVaultRewards", async () => {
      it("should revert when the contract is paused", async () => {
        await yopRewardsContract.connect(governance).pause();
        expect(yopRewardsContract.connect(user1).claimVaultRewards([vault1.address], user1.address)).to.be.revertedWith("Pausable: paused");
      });
      it("should not revert when nothing to claim", async () => {
        await expect(yopRewardsContract.claimVaultRewards([vault2.address], user1.address)).not.to.be.reverted;
      });
      it("should revert when vaults are not empty", async () => {
        await expect(yopRewardsContract.claimVaultRewards([], user1.address)).to.be.revertedWith("no vaults");
      });

      it("should revert if vault doesn't exit", async () => {
        await expect(yopRewardsContract.claimVaultRewards([user1.address], user1.address)).to.be.revertedWith("!vault");
      });
      it("allow users to claim all their vault rewards in a single vault", async () => {
        let balance = await rewards.balanceOf(user1.address);
        await expect(balance).to.equal(0);
        await yopRewardsContract.connect(user1).claimVaultRewards([vault1.address], user1.address);
        balance = await rewards.balanceOf(user1.address);
        const totalRewards = (await yopRewardsContract.claimRecordForAddress(user1.address)).totalAvailable;
        expect(balance.toNumber()).to.be.greaterThan(0);
        expect(balance).to.equal(totalRewards);
        expect(balance).to.be.closeTo(user1VaultRewards, ONE_UNIT);
      });
      it("allow users to claim all their vault rewards in all vaults", async () => {
        let balance = await rewards.balanceOf(user2.address);
        await expect(balance).to.equal(0);
        await yopRewardsContract.connect(user2).claimVaultRewards([vault1.address, vault2.address], user2.address);
        balance = await rewards.balanceOf(user2.address);
        const totalRewards = (await yopRewardsContract.claimRecordForAddress(user2.address)).totalAvailable;
        expect(balance.toNumber()).to.be.greaterThan(0);
        expect(balance).to.equal(totalRewards);
        expect(balance).to.be.closeTo(user2VaultRewards, ONE_UNIT);
      });

      it("user can claim rewards many times", async () => {
        let balance = await rewards.balanceOf(user1.address);
        await expect(balance).to.equal(0);
        await yopRewardsContract.connect(user1).claimVaultRewards([vault1.address], user1.address);
        balance = await rewards.balanceOf(user1.address);
        let totalRewards = (await yopRewardsContract.claimRecordForAddress(user1.address)).totalAvailable;
        expect(balance.toNumber()).to.be.greaterThan(0);
        expect(balance).to.equal(totalRewards);
        expect(balance).to.be.closeTo(user1VaultRewards, ONE_UNIT);
        let claimed = (await yopRewardsContract.claimRecordForAddress(user1.address)).totalClaimed;
        expect(balance).to.equal(claimed);

        await yopRewardsContract.setBlocktimestamp(monthsInSeconds(2));
        const additionalRewards = BigNumber.from(Math.round((INITIAL_RATE * 0.99 * (1 / 3) * (100 / 150)) / 2));
        await yopRewardsContract.connect(await impersonate(vault1.address)).calculateVaultRewards(user1.address);
        totalRewards = (await yopRewardsContract.claimRecordForAddress(user1.address)).totalAvailable;
        claimed = (await yopRewardsContract.claimRecordForAddress(user1.address)).totalClaimed;
        expect(totalRewards.sub(claimed)).to.be.closeTo(additionalRewards, ONE_UNIT);
        await yopRewardsContract.connect(user1).claimVaultRewards([vault1.address], user1.address);
        balance = await rewards.balanceOf(user1.address);
        expect(totalRewards).to.be.closeTo(user1VaultRewards.add(additionalRewards), ONE_UNIT);
        expect(balance).to.equal(totalRewards);
      });
    });

    describe("claimStakingRewards", async () => {
      it("should revert when the contract is paused", async () => {
        await yopRewardsContract.connect(governance).pause();
        await expect(yopRewardsContract.connect(user2).claimStakingRewards(user2.address)).to.be.revertedWith("Pausable: paused");
      });

      it("should revert when to address is not valid", async () => {
        await expect(yopRewardsContract.connect(user2).claimStakingRewards(ethers.constants.AddressZero)).to.be.revertedWith("!input");
      });

      it("should not revert when there is nothing to claim", async () => {
        await expect(yopRewardsContract.connect(user3).claimStakingRewards(user3.address)).not.to.be.reverted;
      });

      it("should allow users to claim their staking rewards", async () => {
        let balance = await rewards.balanceOf(user1.address);
        await expect(balance).to.equal(0);
        await yopRewardsContract.connect(user1).claimStakingRewards(user1.address);
        balance = await rewards.balanceOf(user1.address);
        const totalRewards = (await yopRewardsContract.claimRecordForStake(0)).totalAvailable;
        expect(balance.toNumber()).to.be.greaterThan(0);
        expect(balance).to.equal(totalRewards);
        expect(balance).to.be.closeTo(user1StakingRewards, ONE_UNIT);
      });

      it("can call if staking contract is not set", async () => {
        const newYopRewards = (await YOPRewards.deploy()) as YOPRewardsMock;
        await newYopRewards.deployed();
        await newYopRewards.initialize(governance.address, gatekeeper.address, wallet.address, YOP_CONTRACT_ADDRESS, EPOCH_START_TIME);
        await expect(newYopRewards.connect(user2).claimStakingRewards(user2.address)).not.to.be.reverted;
      });
    });

    describe("claim all", async () => {
      it("should revert when the contract is paused", async () => {
        await yopRewardsContract.connect(governance).pause();
        expect(yopRewardsContract.connect(user2).claimAll(user2.address)).to.be.revertedWith("Pausable: paused");
      });
      it("allow users to claim all their rewards in all vaults ans staking contract", async () => {
        let balance = await rewards.balanceOf(user2.address);
        await expect(balance).to.equal(0);
        await yopRewardsContract.connect(user2).claimAll(user2.address);
        balance = await rewards.balanceOf(user2.address);
        const totalRewards = (await yopRewardsContract.claimRecordForAddress(user2.address)).totalAvailable.add(
          (await yopRewardsContract.claimRecordForStake(1)).totalAvailable
        );
        expect(balance.toNumber()).to.be.greaterThan(0);
        expect(balance).to.equal(totalRewards);
        expect(balance).to.be.closeTo(user2TotalRewards, ONE_UNIT);
      });
      it("can call claimAll if staking contract is not set", async () => {
        const newYopRewards = (await YOPRewards.deploy()) as YOPRewardsMock;
        await newYopRewards.deployed();
        await newYopRewards.initialize(governance.address, gatekeeper.address, wallet.address, YOP_CONTRACT_ADDRESS, EPOCH_START_TIME);
        await expect(newYopRewards.connect(user2).claimAll(user2.address)).not.to.be.reverted;
      });
    });

    describe("unclaimedVaultRewards", async () => {
      it("should return the right amount", async () => {
        const unclaimed = await yopRewardsContract.connect(user2).unclaimedVaultRewards(user2.address, [vault1.address, vault2.address]);
        expect(unclaimed).to.be.closeTo(user2VaultRewards, ONE_UNIT);
      });
      it("should revert if user address is not valid", async () => {
        expect(yopRewardsContract.connect(user2).unclaimedVaultRewards(ethers.constants.AddressZero, [vault1.address])).to.be.revertedWith(
          "!input"
        );
      });
      it("should revert if vaults are empty", async () => {
        expect(yopRewardsContract.connect(user2).unclaimedVaultRewards(user2.address, [])).to.be.revertedWith("!input");
      });
    });

    describe("unclaimedStakingRewards", async () => {
      it("should return the right amount", async () => {
        const unclaimed = await yopRewardsContract.connect(user2).unclaimedStakingRewards([0]);
        expect(unclaimed).to.be.closeTo(user1StakingRewards, ONE_UNIT);
      });
      it("should return 0 if no staking contract set", async () => {
        const newYopRewards = (await YOPRewards.deploy()) as YOPRewardsMock;
        await newYopRewards.deployed();
        await newYopRewards.initialize(governance.address, gatekeeper.address, wallet.address, YOP_CONTRACT_ADDRESS, EPOCH_START_TIME);
        expect(await newYopRewards.connect(user2).unclaimedStakingRewards([0])).to.equal(ethers.constants.Zero);
      });
    });

    describe("allUnclaimedRewards", async () => {
      it("should revert if user address is not valid", async () => {
        expect(yopRewardsContract.connect(user2).allUnclaimedRewards(ethers.constants.AddressZero)).to.be.revertedWith("!input");
      });
      it("should return the right amount", async () => {
        const [unclaimedTotal, unclaimedVaults, unclaimedStaking] = await yopRewardsContract.connect(user2).allUnclaimedRewards(user2.address);
        expect(unclaimedTotal).to.be.closeTo(user2TotalRewards, ONE_UNIT);
        expect(unclaimedVaults).to.be.closeTo(user2VaultRewards, ONE_UNIT);
        expect(unclaimedStaking).to.be.closeTo(user2StakingRewards, ONE_UNIT);
      });
      it("can call if staking contract is not set", async () => {
        const newYopRewards = (await YOPRewards.deploy()) as YOPRewardsMock;
        await newYopRewards.deployed();
        await newYopRewards.initialize(governance.address, gatekeeper.address, wallet.address, YOP_CONTRACT_ADDRESS, EPOCH_START_TIME);
        const [total] = await newYopRewards.connect(user2).allUnclaimedRewards(user2.address);
        expect(total).to.equal(ethers.constants.Zero);
      });
    });
  });
});

describe("YOPRewards proxy [ @skip-on-coverage ]", async () => {
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let wallet: SignerWithAddress;
  let YOPRewards: ContractFactory;
  let yopRewardsContract: YOPRewards;

  beforeEach(async () => {
    [, governance, gatekeeper, wallet] = await ethers.getSigners();
    YOPRewards = await ethers.getContractFactory("YOPRewards");
    const params = [governance.address, gatekeeper.address, wallet.address, YOP_CONTRACT_ADDRESS, EPOCH_START_TIME];
    yopRewardsContract = (await upgrades.deployProxy(YOPRewards, params)) as YOPRewards;
    await yopRewardsContract.deployed();
  });

  it("contract is deployed", async () => {
    expect(await yopRewardsContract.rewardsWallet()).to.equal(wallet.address);
    expect(await yopRewardsContract.yopContractAddress()).to.equal(YOP_CONTRACT_ADDRESS);
    expect(await yopRewardsContract.emissionStartTime()).to.equal(EPOCH_START_TIME);
  });

  it("only governance can upgrade", async () => {
    let YOPRewardsMock = await ethers.getContractFactory("YOPRewardsMock");
    await expect(upgrades.upgradeProxy(yopRewardsContract, YOPRewardsMock)).to.be.revertedWith("governance only");
    YOPRewardsMock = await ethers.getContractFactory("YOPRewardsMock", governance);
    const mockv2 = await upgrades.upgradeProxy(yopRewardsContract, YOPRewardsMock);
    expect(await mockv2.version()).to.equal("2.0.0");
  });
});
