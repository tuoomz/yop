import { BigNumber, utils, constants, Contract, ContractFactory } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network, upgrades, waffle } from "hardhat";
import { MockContract } from "ethereum-waffle";
import ERC20ABI from "../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import FeeCollectionABI from "../../../abi/contracts/interfaces/IFeeCollection.sol/IFeeCollection.json";
import VaultStrategyDataStoreABI from "../../../abi/contracts/vaults/VaultStrategyDataStore.sol/VaultStrategyDataStore.json";
import YOPRewardsABI from "../../../abi/contracts/rewards/YOPRewardsV2.sol/YOPRewardsV2.json";
import StakingABI from "../../../abi/contracts/staking/StakingV2.sol/StakingV2.json";
import { SingleAssetVaultV2BoostedMock } from "../../../types/SingleAssetVaultV2BoostedMock";
const { deployMockContract } = waffle;

describe("SingleAssetVaultV2", async () => {
  const name = "test vault v2";
  const symbol = "tVault";
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let manager: SignerWithAddress;
  let feeCollection: MockContract;
  let user: SignerWithAddress;
  let user2: SignerWithAddress;
  let wallet: SignerWithAddress;
  let token: MockContract;
  let strategyDataStore: MockContract;
  let vault: SingleAssetVaultV2BoostedMock;
  let yopRewards: MockContract;
  let staking: MockContract;
  let SingleAssetVault: ContractFactory;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, manager, user, user2, wallet] = await ethers.getSigners();
    token = await deployMockContract(deployer, ERC20ABI);
    await token.mock.decimals.returns(18);
    feeCollection = await deployMockContract(deployer, FeeCollectionABI);
    strategyDataStore = await deployMockContract(deployer, VaultStrategyDataStoreABI);
    yopRewards = await deployMockContract(deployer, YOPRewardsABI);
    staking = await deployMockContract(deployer, StakingABI);
    const VaultUtilsFactory = await ethers.getContractFactory("VaultUtils");
    const vaultUtils = await VaultUtilsFactory.deploy();
    SingleAssetVault = await ethers.getContractFactory("SingleAssetVaultV2BoostedMock", {
      libraries: {
        VaultUtils: vaultUtils.address,
      },
    });
    const params = [
      name,
      symbol,
      governance.address,
      gatekeeper.address,
      feeCollection.address,
      strategyDataStore.address,
      token.address,
      ethers.constants.AddressZero,
      yopRewards.address,
      staking.address,
    ];
    vault = (await upgrades.deployProxy(SingleAssetVault, params, {
      kind: "uups",
      unsafeAllow: ["external-library-linking", "constructor"],
      initializer: "initializeV2",
    })) as SingleAssetVaultV2BoostedMock;
    await vault.deployed();
  });

  describe("initialize", async () => {
    it("should revert if staking contract is not valid", async () => {
      const params = [
        name,
        symbol,
        governance.address,
        gatekeeper.address,
        feeCollection.address,
        strategyDataStore.address,
        token.address,
        ethers.constants.AddressZero,
        yopRewards.address,
        ethers.constants.AddressZero,
      ];
      await expect(
        upgrades.deployProxy(SingleAssetVault, params, {
          kind: "uups",
          unsafeAllow: ["external-library-linking", "constructor"],
          initializer: "initializeV2",
        })
      ).to.be.revertedWith("!staking");
    });
  });

  it("should return the right version", async () => {
    expect(await vault.version()).to.equal("0.2.0");
  });

  describe("setStakingContract", async () => {
    it("should revert if not set by governance", async () => {
      await expect(vault.setStakingContract(staking.address)).to.be.revertedWith("governance only");
    });
    it("should revert if address is not valid", async () => {
      await expect(vault.connect(governance).setStakingContract(ethers.constants.AddressZero)).to.be.revertedWith("!staking");
    });
    it("update stakingContract address", async () => {
      expect(await vault.stakingContract()).to.equal(staking.address);
      await vault.connect(governance).setStakingContract(staking.address);
      await vault.connect(governance).setStakingContract(manager.address);
      expect(await vault.stakingContract()).to.equal(manager.address);
    });
  });

  describe("setBoostedFormulaWeights", async () => {
    it("should revert if not set by governance", async () => {
      await expect(vault.setBoostedFormulaWeights(2, 8)).to.be.revertedWith("governance only");
    });
    it("should update boosted formula weight", async () => {
      expect((await vault.boostFormulaWeights()).vaultBalanceWeight).to.equal(1);
      expect((await vault.boostFormulaWeights()).stakingBalanceWeight).to.equal(9);
      await vault.connect(governance).setBoostedFormulaWeights(2, 8);
      expect((await vault.boostFormulaWeights()).vaultBalanceWeight).to.equal(2);
      expect((await vault.boostFormulaWeights()).stakingBalanceWeight).to.equal(8);
    });
  });

  describe("boostedBalance", async () => {
    const userBalance = ethers.utils.parseEther("2");
    const user2Balance = ethers.utils.parseEther("1");
    const userStaking = ethers.utils.parseEther("2");
    const user2Staking = ethers.utils.parseEther("2");
    const totalStaking = userStaking.add(user2Staking);

    beforeEach(async () => {
      await vault.connect(governance).unpause();
      await yopRewards.mock.calculateVaultRewards.returns();
      // this is only used when user2 deposits as when user deposits, the totalSupply is 0 so it will just return the same as input amount
      // so make it return the balance of the first user then it will return the correct shares amount for user2
      await token.mock.balanceOf.withArgs(vault.address).returns(userBalance);
      await token.mock.balanceOf.withArgs(user.address).returns(userBalance);
      await token.mock.transferFrom.returns(true);
      await token.mock.balanceOf.withArgs(user2.address).returns(user2Balance);
      await staking.mock.workingBalanceOf.withArgs(user.address).returns(userStaking);
      await staking.mock.workingBalanceOf.withArgs(user2.address).returns(user2Staking);
      await staking.mock.totalWorkingSupply.returns(totalStaking);
    });

    it("should revert if user address is not valid", async () => {
      await expect(vault.boostedBalanceOf(ethers.constants.AddressZero)).to.be.revertedWith("!user");
    });

    it("no boosted balance", async () => {
      await vault.setUseBoostedBalance(false);
      await vault.connect(user).deposit(userBalance, user.address);
      await vault.connect(user2).deposit(user2Balance, user2.address);
      expect(await vault.boostedBalanceOf(user.address)).to.equal(userBalance);
      expect(await vault.boostedBalanceOf(user2.address)).to.equal(user2Balance);
      expect(await vault.totalBoostedSupply()).to.equal(userBalance.add(user2Balance));
    });

    it("with boosted balance", async () => {
      await vault.setUseBoostedBalance(true);
      await vault.connect(user).deposit(userBalance, user.address);
      await vault.connect(user2).deposit(user2Balance, user2.address);
      // math.min(1 * 2 + 9 * 2/4 * 2, 10 * 2) = 11, it is calculated after user deposit, and the total vault size is 2
      expect(await vault.boostedBalanceOf(user.address)).to.equal(ethers.utils.parseEther("11"));
      // math.min(1 * 1 + 9 * 2/4 * 3, 10 * 1) = 10, calculated after user 2 deposit the total value size is 3
      expect(await vault.boostedBalanceOf(user2.address)).to.equal(ethers.utils.parseEther("10"));
      expect(await vault.totalBoostedSupply()).to.equal(ethers.utils.parseEther("21"));
      // math.min(1 * 2 + 9 * 2/4 * 3, 10 * 2) = 15.5, this is calculated after both user 1 & 2 deposited so the boost will be changed again
      expect(await vault.latestBoostedBalanceOf(user.address)).to.equal(ethers.utils.parseEther("15.5"));
      await vault.connect(user).transfer(user2.address, ethers.utils.parseEther("1"));
      // math.min(1 * 1 + 9 * 2/4 * 3, 10 * 1) = 10
      expect(await vault.boostedBalanceOf(user.address)).to.equal(ethers.utils.parseEther("10"));
      // math.min(1 * 2 + 9 * 2/4 * 3, 10 * 2) = 15.5
      expect(await vault.boostedBalanceOf(user2.address)).to.equal(ethers.utils.parseEther("15.5"));
      await token.mock.balanceOf.withArgs(vault.address).returns(userBalance.add(user2Balance));
      await token.mock.transfer.returns(true);
      await vault.connect(user).withdraw(ethers.utils.parseEther("0.5"), user.address, 5000);
      // math.min(1 * 0.5 + 9 * 2/4 * 2.5, 10 * 0.5) = 5
      expect(await vault.boostedBalanceOf(user.address)).to.equal(ethers.utils.parseEther("5"));
      // math.min(1 * 2 + 9 * 2/4 * 3, 10 * 2) = 15.5 the balance of user2 is not updated
      expect(await vault.boostedBalanceOf(user2.address)).to.equal(ethers.utils.parseEther("15.5"));
    });

    it("updateBoostedBalancesForUsers", async () => {
      await vault.setUseBoostedBalance(true);
      await vault.connect(user).deposit(userBalance, user.address);
      await vault.connect(user2).deposit(user2Balance, user2.address);
      // math.min(1 * 2 + 9 * 2/4 * 2, 10 * 2) = 11, it is calculated after user deposit, and the total vault size is 2
      expect(await vault.boostedBalanceOf(user.address)).to.equal(ethers.utils.parseEther("11"));
      // math.min(1 * 1 + 9 * 2/4 * 3, 10 * 1) = 10, calculated after user 2 deposit the total value size is 3
      expect(await vault.boostedBalanceOf(user2.address)).to.equal(ethers.utils.parseEther("10"));
      expect(await vault.totalBoostedSupply()).to.equal(ethers.utils.parseEther("21"));
      await vault.updateBoostedBalancesForUsers([user.address, user2.address]);
      // math.min(1 * 2 + 9 * 2/4 * 3, 10 * 2) = 15.5, it is calculated after user deposit, and the total vault size is 2
      expect(await vault.boostedBalanceOf(user.address)).to.equal(ethers.utils.parseEther("15.5"));
      // math.min(1 * 1 + 9 * 2/4 * 3, 10 * 1) = 10, calculated after user 2 deposit the total value size is 3
      expect(await vault.boostedBalanceOf(user2.address)).to.equal(ethers.utils.parseEther("10"));
      expect(await vault.totalBoostedSupply()).to.equal(ethers.utils.parseEther("25.5"));
      await vault.connect(governance).setBoostedFormulaWeights(2, 8);
      await vault.updateBoostedBalancesForUsers([user.address, user2.address]);
      // math.min(2 * 2 + 8 * 2/4 * 3, 10 * 2) = 16
      expect(await vault.boostedBalanceOf(user.address)).to.equal(ethers.utils.parseEther("16"));
      // math.min(2 * 1 + 8 * 2/4 * 3, 10 * 1) = 10
      expect(await vault.boostedBalanceOf(user2.address)).to.equal(ethers.utils.parseEther("10"));
      expect(await vault.totalBoostedSupply()).to.equal(ethers.utils.parseEther("26"));
    });

    it("should work if no rewards contract set", async () => {
      await vault.setUseBoostedBalance(true);
      await vault.connect(governance).setVaultRewardsContract(ethers.constants.AddressZero);
      await vault.connect(user).deposit(userBalance, user.address);
      await vault.connect(user2).deposit(user2Balance, user2.address);
      // math.min(1 * 2 + 9 * 2/4 * 2, 10 * 2) = 11, it is calculated after user deposit, and the total vault size is 2
      expect(await vault.boostedBalanceOf(user.address)).to.equal(ethers.utils.parseEther("11"));
      // math.min(1 * 1 + 9 * 2/4 * 3, 10 * 1) = 10, calculated after user 2 deposit the total value size is 3
      expect(await vault.boostedBalanceOf(user2.address)).to.equal(ethers.utils.parseEther("10"));
      expect(await vault.totalBoostedSupply()).to.equal(ethers.utils.parseEther("21"));
      await vault.updateBoostedBalancesForUsers([user.address, user2.address]);
      // math.min(1 * 2 + 9 * 2/4 * 3, 10 * 2) = 15.5, it is calculated after user deposit, and the total vault size is 2
      expect(await vault.boostedBalanceOf(user.address)).to.equal(ethers.utils.parseEther("15.5"));
      // math.min(1 * 1 + 9 * 2/4 * 3, 10 * 1) = 10, calculated after user 2 deposit the total value size is 3
      expect(await vault.boostedBalanceOf(user2.address)).to.equal(ethers.utils.parseEther("10"));
    });
  });
});
