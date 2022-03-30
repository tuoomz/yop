import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, waffle } from "hardhat";
import { MockContract } from "ethereum-waffle";
import ERC20ABI from "../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import YOPRewardsABI from "../../../abi/contracts/rewards/YOPRewards.sol/YOPRewards.json";
import SingleAssetVaultV2ABI from "../../../abi/contracts/vaults/SingleAssetVaultV2.sol/SingleAssetVaultV2.json";
import { StakingV2Mock } from "../../../types";
import { BigNumber, ContractFactory } from "ethers";
import { monthsInSeconds } from "../utils/time";
const TOKEN_DECIMALS = 8;
const CONTRACT_URI = "https://yop.finance/"; // random url
const { deployMockContract } = waffle;

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
    staking = (await StakingContractFactory.deploy()) as StakingV2Mock;
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
    vault1 = await deployMockContract(deployer, SingleAssetVaultV2ABI);
    vault2 = await deployMockContract(deployer, SingleAssetVaultV2ABI);
  });

  it("totalSupply", async () => {
    expect(await staking.totalSupply()).to.equal(ethers.constants.Zero);
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
});
