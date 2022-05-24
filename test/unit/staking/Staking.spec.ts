import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, waffle } from "hardhat";
import { MockContract } from "ethereum-waffle";
import ERC20ABI from "../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import { StakingMock } from "../../../types/StakingMock";
import { BigNumber } from "@ethersproject/bignumber";
import { monthsInSeconds } from "../utils/time";
import YOPRewardsABI from "../../../abi/contracts/rewards/YOPRewardsV2.sol/YOPRewardsV2.json";
import { ContractFactory } from "ethers";
import IAccessManagerABI from "../../../abi/contracts/interfaces/IAccessControlManager.sol/IAccessControlManager.json";

const TOKEN_DECIMALS = 8;
const CONTRACT_URI = "https://yop.finance/"; // random url
const { deployMockContract } = waffle;

describe("Staking", async () => {
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let user: SignerWithAddress;
  let owner: SignerWithAddress;
  let stakeToken: MockContract;
  let staking: StakingMock;
  let yopReward: MockContract;
  let StakingContractFactory: ContractFactory;
  let accessManager: MockContract;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, user, owner] = await ethers.getSigners();
    stakeToken = await deployMockContract(deployer, ERC20ABI);
    yopReward = await deployMockContract(deployer, YOPRewardsABI);
    StakingContractFactory = await ethers.getContractFactory("StakingMock");
    staking = (await StakingContractFactory.deploy()) as StakingMock;
    await staking.deployed();
    await staking.initialize(
      "staking",
      "sta",
      governance.address,
      gatekeeper.address,
      yopReward.address,
      "https://example.com",
      CONTRACT_URI,
      owner.address,
      ethers.constants.AddressZero
    );
    await staking.setToken(stakeToken.address);
    await yopReward.mock.calculateStakingRewards.returns();
    accessManager = await deployMockContract(deployer, IAccessManagerABI);
  });

  describe("initialize", async () => {
    it("should revert if reward contract address is not valid", async () => {
      const anotherStaking = (await StakingContractFactory.deploy()) as StakingMock;
      await anotherStaking.deployed();
      await expect(
        anotherStaking.initialize(
          "staking",
          "sta",
          governance.address,
          gatekeeper.address,
          ethers.constants.AddressZero,
          "url",
          CONTRACT_URI,
          owner.address,
          ethers.constants.AddressZero
        )
      ).to.be.revertedWith("!input");
    });

    it("should revert if owner address is not valid", async () => {
      const anotherStaking = (await StakingContractFactory.deploy()) as StakingMock;
      await anotherStaking.deployed();
      await expect(
        anotherStaking.initialize(
          "staking",
          "sta",
          governance.address,
          gatekeeper.address,
          yopReward.address,
          "url",
          CONTRACT_URI,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero
        )
      ).to.be.revertedWith("!input");
    });

    it("should revert if called more than once", async () => {
      await expect(
        staking.initialize(
          "staking",
          "sta",
          governance.address,
          gatekeeper.address,
          yopReward.address,
          "url",
          CONTRACT_URI,
          owner.address,
          ethers.constants.AddressZero
        )
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  describe("base props", async () => {
    it("should return name", async () => {
      expect(await staking.name()).to.equal("staking");
    });
    it("should return symbol", async () => {
      expect(await staking.symbol()).to.equal("sta");
    });
    it("should return owner", async () => {
      expect(await staking.owner()).to.equal(owner.address);
    });
  });

  describe("workingBalanceOfStake", async () => {
    it("should return 0 if stake id is not valid", async () => {
      expect(await staking.workingBalanceOfStake(1)).to.equal(0);
    });
  });

  describe("setMinStakeAmount", async () => {
    const minAmount = ethers.utils.parseUnits("10", TOKEN_DECIMALS);
    it("only governance can set", async () => {
      await expect(staking.connect(user).setMinStakeAmount(minAmount)).to.be.revertedWith("governance only");
      expect(await staking.minStakeAmount()).to.equal(ethers.constants.Zero);
      await staking.connect(governance).setMinStakeAmount(minAmount);
      expect(await staking.minStakeAmount()).to.equal(minAmount);
    });
  });

  describe("setAccessManager", async () => {
    it("only governance can set", async () => {
      await expect(staking.connect(user).setAccessControlManager(accessManager.address)).to.be.revertedWith("governance only");
    });
    it("should update access manager", async () => {
      expect(await staking.accessControlManager()).to.equal(ethers.constants.AddressZero);
      await expect(staking.connect(governance).setAccessControlManager(accessManager.address))
        .to.emit(staking, "AccessControlManagerUpdated")
        .withArgs(accessManager.address);
      expect(await staking.accessControlManager()).to.equal(accessManager.address);
    });
  });

  describe("stake", async () => {
    const minAmount = ethers.utils.parseUnits("1", TOKEN_DECIMALS);
    const stakeAmount = ethers.utils.parseUnits("1.1", TOKEN_DECIMALS);
    beforeEach(async () => {
      await staking.connect(governance).setMinStakeAmount(minAmount);
    });

    it("should revert if contract is paused", async () => {
      await staking.connect(gatekeeper).pause();
      await expect(staking.stake(stakeAmount, 1)).to.be.revertedWith("Pausable: paused");
    });

    it("should revert if amount is less then minStakeAmount", async () => {
      await expect(staking.stake(ethers.utils.parseUnits("0.5", TOKEN_DECIMALS), 1)).to.be.revertedWith("!amount");
    });

    it("should revert if lock period is out of range", async () => {
      await expect(staking.stake(stakeAmount, 0)).to.be.revertedWith("!lockPeriod");
      await expect(staking.stake(stakeAmount, 61)).to.be.revertedWith("!lockPeriod");
    });

    it("should revert if user does not have enough tokens", async () => {
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("0.5", TOKEN_DECIMALS));
      await expect(staking.stake(stakeAmount, 1)).to.be.revertedWith("!balance");
    });

    it("should revert if user does not have access", async () => {
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("2", TOKEN_DECIMALS));
      await staking.connect(governance).setAccessControlManager(accessManager.address);
      await accessManager.mock.hasAccess.returns(false);
      await expect(staking.stake(stakeAmount, 1)).to.be.revertedWith("!access");
    });

    it("should be able to stake and get a token back", async () => {
      const blockTime = Math.round(new Date().getTime() / 1000);
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("2", TOKEN_DECIMALS));
      await stakeToken.mock.transferFrom.returns(true);
      await staking.setBlocktime(blockTime);
      await staking.connect(governance).setAccessControlManager(accessManager.address);
      await accessManager.mock.hasAccess.returns(true);
      expect(await staking.balanceOf(user.address, 0)).to.equal(0);
      expect(await staking.totalWorkingSupply()).to.equal(0);
      expect(await staking.workingBalanceOf(user.address)).to.equal(0);
      expect(await staking.stakesFor(user.address)).to.deep.equal([]);
      await expect(await staking.connect(user).stake(stakeAmount, 2))
        .to.emit(staking, "Staked")
        .withArgs(user.address, 0, stakeAmount, 2, blockTime);
      expect(await staking.balanceOf(user.address, 0)).to.equal(1);
      expect(await staking.totalWorkingSupply()).to.equal(stakeAmount.mul(2));
      expect(await staking.workingBalanceOf(user.address)).to.equal(stakeAmount.mul(2));
      expect(await staking.stakesFor(user.address)).to.deep.equal([ethers.constants.Zero]);
      expect(await staking.stakes(0)).to.deep.equal([2, stakeAmount, BigNumber.from(blockTime), BigNumber.from(blockTime)]);
    });

    it("should be able to stake multiple times", async () => {
      const blockTime = Math.round(new Date().getTime() / 1000);
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("2", TOKEN_DECIMALS));
      await stakeToken.mock.transferFrom.returns(true);
      await staking.setBlocktime(blockTime);
      await staking.connect(user).stake(stakeAmount, 2);
      await staking.connect(user).stake(stakeAmount, 6);

      expect(await staking.balanceOf(user.address, 0)).to.equal(1);
      expect(await staking.balanceOf(user.address, 1)).to.equal(1);

      expect(await staking.totalWorkingSupply()).to.equal(stakeAmount.mul(2 + 6));
      expect(await staking.workingBalanceOf(user.address)).to.equal(stakeAmount.mul(2 + 6));
      expect(await staking.workingBalanceOfStake(0)).to.equal(stakeAmount.mul(2));
      expect(await staking.workingBalanceOfStake(1)).to.equal(stakeAmount.mul(6));
      expect(await staking.stakesFor(user.address)).to.deep.equal([ethers.constants.Zero, ethers.constants.One]);
    });
  });

  describe("unstakeSingle", async () => {
    const amount1 = ethers.utils.parseUnits("1", TOKEN_DECIMALS);
    const amount2 = ethers.utils.parseUnits("2", TOKEN_DECIMALS);
    const blockTime = Math.round(new Date().getTime() / 1000);
    let user2: SignerWithAddress;
    beforeEach(async () => {
      await staking.setBlocktime(blockTime);
      [user2] = (await ethers.getSigners()).reverse();
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("3", TOKEN_DECIMALS));
      await stakeToken.mock.transferFrom.returns(true);

      await staking.connect(user).stake(amount1, 2);
      await staking.connect(user).stake(amount1, 3);
      await staking.connect(user2).stake(amount2, 6);
    });

    it("should revert if contract is paused", async () => {
      await staking.connect(gatekeeper).pause();
      const bt = monthsInSeconds(3);
      await staking.setBlocktime(bt);
      await expect(staking.connect(user).unstakeSingle(0, user.address)).to.be.revertedWith("Pausable: paused");
    });

    it("should revert if to address is not valid", async () => {
      await expect(staking.connect(user).unstakeSingle(2, ethers.constants.AddressZero)).to.be.revertedWith("!input");
    });

    it("should revert if user is not the owner", async () => {
      await expect(staking.connect(user).unstakeSingle(2, user.address)).to.be.revertedWith("!stake");
    });

    it("should revert if stake is still locked", async () => {
      const bt = monthsInSeconds(1);
      await staking.setBlocktime(bt);
      await expect(staking.connect(user).unstakeSingle(0, user.address)).to.be.revertedWith("locked");
    });

    it("should be able to unstake", async () => {
      const bt = monthsInSeconds(3);
      await staking.setBlocktime(bt);
      await stakeToken.mock.transfer.returns(true);
      await yopReward.mock.claimRewardsForStakes.returns(0, []);
      await expect(await staking.connect(user).unstakeSingle(0, user.address))
        .to.emit(staking, "Unstaked")
        .withArgs(user.address, 0, amount1, 2, blockTime);
      expect(await staking.balanceOf(user.address, 0)).to.equal(0);
      expect(await staking.workingBalanceOf(user.address)).equal(amount1.mul(3));
      expect(await staking.totalWorkingSupply()).to.equal(amount2.mul(6).add(amount1.mul(3)));
      expect(await staking.stakesFor(user.address)).to.deep.equal([ethers.constants.One]);
      expect(await staking.stakes(0)).to.deep.equal([0, ethers.constants.Zero, ethers.constants.Zero, ethers.constants.Zero]);
    });

    it("should be able to unstake after transfer", async () => {
      const bt = monthsInSeconds(3);
      await staking.setBlocktime(bt);
      await stakeToken.mock.transfer.returns(true);
      await yopReward.mock.claimRewardsForStakes.returns(0, []);

      await staking.connect(user).safeTransferFrom(user.address, user2.address, 0, 1, [0]);
      expect(await staking.balanceOf(user.address, 0)).to.equal(0);
      expect(await staking.workingBalanceOf(user.address)).to.equal(amount1.mul(3));
      expect(await staking.stakesFor(user.address)).to.deep.equal([ethers.constants.One]);
      expect(await staking.balanceOf(user2.address, 0)).to.equal(1);
      expect(await staking.workingBalanceOf(user2.address)).to.equal(amount1.mul(2).add(amount2.mul(6)));
      expect(await staking.stakesFor(user2.address)).to.deep.equal([ethers.constants.Two, ethers.constants.Zero]);
      await expect(await staking.connect(user2).unstakeSingle(0, user2.address))
        .to.emit(staking, "Unstaked")
        .withArgs(user2.address, 0, amount1, 2, blockTime);
      expect(await staking.balanceOf(user2.address, 0)).to.equal(0);
      expect(await staking.workingBalanceOf(user2.address)).to.equal(amount2.mul(6));
      expect(await staking.stakesFor(user2.address)).to.deep.equal([ethers.constants.Two]);
    });
  });

  describe("contractURI", async () => {
    it("should return matching contractURI as constructor params", async () => {
      expect(await staking.contractURI()).to.equal(CONTRACT_URI);
    });

    it("is updatable by governance", async () => {
      const newURI = "www.example.com";
      await expect(staking.connect(user).setContractURI(newURI)).to.be.revertedWith("governance only");
      expect(await staking.contractURI()).to.equal(CONTRACT_URI);
      await expect(await staking.connect(governance).setContractURI(newURI))
        .to.emit(staking, "StakingContractURIUpdated")
        .withArgs(newURI);
      expect(await staking.contractURI()).to.equal(newURI);
    });
  });

  describe("unstakeAll", async () => {
    const amount1 = ethers.utils.parseUnits("1", TOKEN_DECIMALS);
    const amount2 = ethers.utils.parseUnits("2", TOKEN_DECIMALS);
    const blockTime = Math.round(new Date().getTime() / 1000);
    beforeEach(async () => {
      await staking.setBlocktime(blockTime);
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("3", TOKEN_DECIMALS));
      await stakeToken.mock.transferFrom.returns(true);
      await stakeToken.mock.transfer.returns(true);

      await staking.connect(user).stake(amount1, 2);
      await staking.connect(user).stake(amount2, 4);

      await yopReward.mock.claimRewardsForStakes.returns(0, []);
    });

    it("should revert if contract is paused", async () => {
      await staking.connect(gatekeeper).pause();
      const bt = monthsInSeconds(3);
      await staking.setBlocktime(bt);
      await expect(staking.connect(user).unstakeAll(user.address)).to.be.revertedWith("Pausable: paused");
    });

    it("should revert if to address is not valid", async () => {
      await expect(staking.connect(user).unstakeAll(ethers.constants.AddressZero)).to.be.revertedWith("!input");
    });

    it("should revert is there are no unlocked stakes", async () => {
      const bt = monthsInSeconds(1);
      await staking.setBlocktime(bt);
      await expect(staking.connect(user).unstakeAll(user.address)).to.be.revertedWith("!unlocked");
    });

    it("should unstake unlocked stakes", async () => {
      const bt = monthsInSeconds(3);
      await staking.setBlocktime(bt);
      await expect(await staking.connect(user).unstakeAll(user.address))
        .to.emit(staking, "Unstaked")
        .withArgs(user.address, 0, amount1, 2, blockTime);
      expect(await staking.balanceOf(user.address, 0)).to.equal(0);
      expect(await staking.balanceOf(user.address, 1)).to.equal(1);
      expect(await staking.stakesFor(user.address)).to.deep.equal([ethers.constants.One]);
      expect(await staking.totalWorkingSupply()).to.equal(amount2.mul(4));
    });
  });

  describe("stakingLimit", async () => {
    it("limit is set to max uint256 by default", async () => {
      expect(await staking.connect(user).stakingLimit()).to.equal(ethers.constants.MaxUint256);
    });
    it("only governance can set staking limit", async () => {
      const limit = BigNumber.from("5000000000000");
      await expect(staking.connect(user).setStakingLimit(limit)).to.be.revertedWith("governance only");
      await expect(await staking.connect(governance).setStakingLimit(limit))
        .to.emit(staking, "StakingLimitUpdated")
        .withArgs(limit);
      expect(await staking.connect(user).stakingLimit()).to.equal(limit);
      await expect(await staking.connect(governance).setStakingLimit(limit)).not.to.emit(staking, "StakingLimitUpdated");
    });
    it("should fail to staking if limit will be reached", async () => {
      const limit = ethers.utils.parseUnits("1", TOKEN_DECIMALS).mul(6); // 1 YOP for 6 months
      await expect(await staking.connect(governance).setStakingLimit(limit));
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("2", TOKEN_DECIMALS));
      await expect(staking.connect(user).stake(ethers.utils.parseUnits("1", TOKEN_DECIMALS), 7)).to.be.revertedWith("limit reached");
    });
  });

  describe("safeTransferFrom", async () => {
    const amount1 = ethers.utils.parseUnits("1", TOKEN_DECIMALS);
    const amount2 = ethers.utils.parseUnits("2", TOKEN_DECIMALS);
    const blockTime = Math.round(new Date().getTime() / 1000);
    let user2: SignerWithAddress;
    beforeEach(async () => {
      await staking.setBlocktime(blockTime);
      [user2] = (await ethers.getSigners()).reverse();
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("3", TOKEN_DECIMALS));
      await stakeToken.mock.transferFrom.returns(true);

      await staking.connect(user).stake(amount1, 2);
      await staking.connect(user).stake(amount1, 3);
      await staking.connect(user2).stake(amount2, 6);
    });

    it("should revert if transfer 0 amount of tokens", async () => {
      // user tries to transfer the token belongs to user2
      await expect(staking.connect(user).safeTransferFrom(user.address, user.address, 2, 0, [])).to.be.revertedWith("!amount");
    });

    it("should revert if the from address is not the owner of the token", async () => {
      await expect(staking.connect(user).safeTransferFrom(user.address, user.address, 2, 1, [])).to.be.revertedWith("!allowed");
    });

    it("should remove stake if address is the owner", async () => {
      let stakes = await staking.stakesFor(user.address);
      expect(stakes.length).to.equal(2);
      await staking.removeStake(user.address, 0);
      stakes = await staking.stakesFor(user.address);
      expect(stakes.length).to.equal(1);
      await staking.removeStake(user.address, 0);
      expect(stakes.length).to.equal(1);
    });
  });
});
