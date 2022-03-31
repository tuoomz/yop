import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ContractFactory } from "ethers";
import { ethers, waffle } from "hardhat";
import { MockContract } from "ethereum-waffle";
import { YOPRewardsV2Mock } from "../../../types";
import singleAssetVaultV2ABI from "../../../abi/contracts/vaults/SingleAssetVaultV2.sol/SingleAssetVaultV2.json";
import ERC20ABI from "../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import { monthsInSeconds } from "../utils/time";
import { impersonate } from "../utils/Impersonate";
const { deployMockContract } = waffle;

const YOP_CONTRACT_ADDRESS = "0xAE1eaAE3F627AAca434127644371b67B18444051";
const EPOCH_START_TIME = 1640995200; // 2022-1-1-00:00:00 GMT

describe("YOPRewardsV2", async () => {
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let wallet: SignerWithAddress;
  let YOPRewardsV2: ContractFactory;
  let yopRewardsV2Contract: YOPRewardsV2Mock;
  let user1: SignerWithAddress;
  let vault1: MockContract;
  let vault2: MockContract;
  let rewardContract: MockContract;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, wallet, user1] = await ethers.getSigners();
    YOPRewardsV2 = await ethers.getContractFactory("YOPRewardsV2Mock");
    yopRewardsV2Contract = (await YOPRewardsV2.deploy()) as YOPRewardsV2Mock;
    await yopRewardsV2Contract.deployed();
    await yopRewardsV2Contract.initialize(governance.address, gatekeeper.address, wallet.address, YOP_CONTRACT_ADDRESS, EPOCH_START_TIME);
    vault1 = await deployMockContract(deployer, singleAssetVaultV2ABI);
    vault2 = await deployMockContract(deployer, singleAssetVaultV2ABI);
    const points = [100, 50];
    await yopRewardsV2Contract.setInitialVaultWeights([vault1.address, vault2.address], points);
    await yopRewardsV2Contract.setInitialRewardsRatios(5000, 5000);
    rewardContract = await deployMockContract(deployer, ERC20ABI);
    await yopRewardsV2Contract.setRewardAddress(rewardContract.address);
    await rewardContract.mock.transfer.returns(true);
    await rewardContract.mock.transferFrom.returns(true);
  });

  describe("claimVaultRewards", async () => {
    it("should reverts if no vaults are provided", async () => {
      await expect(yopRewardsV2Contract.claimVaultRewards([], user1.address)).to.be.revertedWith("no vaults");
    });
    it("should revert if vault address is not valid", async () => {
      await expect(yopRewardsV2Contract.claimVaultRewards([user1.address], user1.address)).to.be.revertedWith("!vault");
    });
    it("should success", async () => {
      const start = monthsInSeconds(0);
      const end = monthsInSeconds(120);
      const blockTimestamp = monthsInSeconds(1); // the end of first month
      await yopRewardsV2Contract.setEpochStartTime(start);
      await yopRewardsV2Contract.setEpochEndTime(end);
      await yopRewardsV2Contract.setBlocktimestamp(blockTimestamp);
      await vault1.mock.decimals.returns(8);
      await vault1.mock.boostedBalanceOf.returns(10);
      await vault1.mock.totalBoostedSupply.returns(100);
      await vault1.mock.balanceOf.returns(1000);
      await vault2.mock.decimals.returns(8);
      await vault2.mock.boostedBalanceOf.returns(0);
      await vault2.mock.totalBoostedSupply.returns(200);
      await vault2.mock.balanceOf.returns(0);
      await vault1.mock.updateBoostedBalancesForUsers.returns();
      await yopRewardsV2Contract.connect(await impersonate(vault1.address)).calculateVaultRewards(user1.address);
      await yopRewardsV2Contract.connect(await impersonate(vault2.address)).calculateVaultRewards(user1.address);
      await expect(yopRewardsV2Contract.connect(user1).claimVaultRewards([vault1.address, vault2.address], user1.address)).not.to.be.reverted;
    });
  });
});
