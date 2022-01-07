import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, waffle } from "hardhat";
import { MockContract } from "ethereum-waffle";
import ERC20ABI from "../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import { StakingMock } from "../../../types/StakingMock";
import { BigNumber } from "@ethersproject/bignumber";
import { monthsInSeconds } from "../utils/time";

const TOKEN_DECIMALS = 8;
const { deployMockContract } = waffle;

describe("Staking", async () => {
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let user: SignerWithAddress;
  let stakeToken: MockContract;
  let staking: StakingMock;

  beforeEach(async () => {
    [deployer, governance, user] = await ethers.getSigners();
    stakeToken = await deployMockContract(deployer, ERC20ABI);
    const StakingContractFactory = await ethers.getContractFactory("StakingMock");
    staking = (await StakingContractFactory.deploy(governance.address, stakeToken.address)) as StakingMock;
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

  describe("stake", async () => {
    const minAmount = ethers.utils.parseUnits("1", TOKEN_DECIMALS);
    beforeEach(async () => {
      await staking.connect(governance).setMinStakeAmount(minAmount);
    });

    it("should revert if amount is less then minStakeAmount", async () => {
      await expect(staking.stake(ethers.utils.parseUnits("0.5", TOKEN_DECIMALS), 1)).to.be.revertedWith("!amount");
    });

    it("should revert if lock period is out of range", async () => {
      await expect(staking.stake(minAmount, 0)).to.be.revertedWith("!lockPeriod");
      await expect(staking.stake(minAmount, 61)).to.be.revertedWith("!lockPeriod");
    });

    it("should revert if user does not have enough tokens", async () => {
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("0.5", TOKEN_DECIMALS));
      await expect(staking.stake(minAmount, 1)).to.be.revertedWith("!balance");
    });

    it("should be able to stake and get a token back", async () => {
      const blockTime = Math.round(new Date().getTime() / 1000);
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("2", TOKEN_DECIMALS));
      await stakeToken.mock.transferFrom.returns(true);
      await staking.setBlocktime(blockTime);
      expect(await staking.balanceOf(user.address, 0)).to.equal(0);
      expect(await staking.totalWorkingSupply()).to.equal(0);
      expect(await staking.workingBalanceOf(user.address)).to.equal(0);
      expect(await staking.stakesFor(user.address)).to.deep.equal([]);
      expect(await staking.owners(0)).to.equal(ethers.constants.AddressZero);
      await expect(await staking.connect(user).stake(minAmount, 2))
        .to.emit(staking, "Staked")
        .withArgs(user.address, 0, minAmount, 2, blockTime);
      expect(await staking.balanceOf(user.address, 0)).to.equal(1);
      expect(await staking.totalWorkingSupply()).to.equal(minAmount.mul(2));
      expect(await staking.workingBalanceOf(user.address)).to.equal(minAmount.mul(2));
      expect(await staking.stakesFor(user.address)).to.deep.equal([ethers.constants.Zero]);
      expect(await staking.owners(0)).to.equal(user.address);
      expect(await staking.stakes(0)).to.deep.equal([2, minAmount, BigNumber.from(blockTime), BigNumber.from(blockTime)]);
    });

    it("should be able to stake multiple times", async () => {
      const blockTime = Math.round(new Date().getTime() / 1000);
      await stakeToken.mock.balanceOf.returns(ethers.utils.parseUnits("2", TOKEN_DECIMALS));
      await stakeToken.mock.transferFrom.returns(true);
      await staking.setBlocktime(blockTime);
      await staking.connect(user).stake(minAmount, 2);
      await staking.connect(user).stake(minAmount, 6);

      expect(await staking.balanceOf(user.address, 0)).to.equal(1);
      expect(await staking.balanceOf(user.address, 1)).to.equal(1);

      expect(await staking.totalWorkingSupply()).to.equal(minAmount.mul(2 + 6));
      expect(await staking.workingBalanceOf(user.address)).to.equal(minAmount.mul(2 + 6));
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

    it("should revert if user is not the owner", async () => {
      await expect(staking.connect(user).unstakeSingle(2)).to.be.revertedWith("!stake");
    });

    it("should revert if stake is not expired", async () => {
      const bt = monthsInSeconds(1);
      await staking.setBlocktime(bt);
      await expect(staking.connect(user).unstakeSingle(0)).to.be.revertedWith("!expired");
    });

    it("should be able to unstake", async () => {
      const bt = monthsInSeconds(3);
      await staking.setBlocktime(bt);
      await stakeToken.mock.transfer.returns(true);

      await expect(await staking.connect(user).unstakeSingle(0))
        .to.emit(staking, "Unstaked")
        .withArgs(user.address, 0, amount1, 2, blockTime);
      expect(await staking.balanceOf(user.address, 0)).to.equal(0);
      expect(await staking.workingBalanceOf(user.address)).equal(amount1.mul(3));
      expect(await staking.totalWorkingSupply()).to.equal(amount2.mul(6).add(amount1.mul(3)));
      expect(await staking.stakesFor(user.address)).to.deep.equal([ethers.constants.One]);
      expect(await staking.stakes(0)).to.deep.equal([0, ethers.constants.Zero, ethers.constants.Zero, ethers.constants.Zero]);
      expect(await staking.owners(0)).to.equal(ethers.constants.AddressZero);
    });

    it("should be able to unstake after transfer", async () => {
      const bt = monthsInSeconds(3);
      await staking.setBlocktime(bt);
      await stakeToken.mock.transfer.returns(true);

      await staking.connect(user).safeTransferFrom(user.address, user2.address, 0, 1, [0]);
      expect(await staking.balanceOf(user.address, 0)).to.equal(0);
      expect(await staking.workingBalanceOf(user.address)).to.equal(amount1.mul(3));
      expect(await staking.stakesFor(user.address)).to.deep.equal([ethers.constants.One]);
      expect(await staking.balanceOf(user2.address, 0)).to.equal(1);
      expect(await staking.workingBalanceOf(user2.address)).to.equal(amount1.mul(2).add(amount2.mul(6)));
      expect(await staking.stakesFor(user2.address)).to.deep.equal([ethers.constants.Two, ethers.constants.Zero]);
      expect(await staking.owners(0)).to.equal(user2.address);
      await expect(await staking.connect(user2).unstakeSingle(0))
        .to.emit(staking, "Unstaked")
        .withArgs(user2.address, 0, amount1, 2, blockTime);
      expect(await staking.balanceOf(user2.address, 0)).to.equal(0);
      expect(await staking.workingBalanceOf(user2.address)).to.equal(amount2.mul(6));
      expect(await staking.stakesFor(user2.address)).to.deep.equal([ethers.constants.Two]);
    });
  });
});
