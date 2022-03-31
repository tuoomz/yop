import { expect } from "chai";
import { impersonate, setEthBalance, setupVault, jumpForward } from "../shared/setup";
import { ethers, network } from "hardhat";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import ERC20ABI from "../../../abi/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json";
import { AccessControlManager, CurveStable, FeeCollection, IWETH, TokenMock, VaultStrategyDataStore, YOPRewards } from "../../../types";
import { ERC20 } from "../../../types/ERC20";
import { Staking } from "../../../types/Staking";
import { BigNumber } from "ethers";
import { CONST } from "../../constants";

let vault: SingleAssetVault;
let governance: SignerWithAddress;
let gatekeeper: SignerWithAddress;
let developer: SignerWithAddress;
let proposer: SignerWithAddress;
let vaultCreator: SignerWithAddress;
let yopRewards: YOPRewards;
let yopWalletAccount: SignerWithAddress;
let yopStaking: Staking;
let accessManager: AccessControlManager;
let feeCollection: FeeCollection;
let vaultStrategyDataStore: VaultStrategyDataStore;
let usdcContract: ERC20;
let strategy: CurveStable;

const defaultVaultCreatorFeeRatio = 2000;
const defaultStrategyProposerFeeRatio = 1000;
const defaultStrategyDeveloperFeeRatio = 1000;
const feeCollected = ethers.utils.parseUnits("1000", CONST.TOKENS.USDC.DECIMALS);
const creatorFees = feeCollected.mul(defaultVaultCreatorFeeRatio).div(CONST.MAX_BPS);
const protocolFees = feeCollected.mul(CONST.MAX_BPS - defaultVaultCreatorFeeRatio).div(CONST.MAX_BPS);
const proposerFees = feeCollected.mul(defaultStrategyProposerFeeRatio).div(CONST.MAX_BPS);
const developerFees = feeCollected.mul(defaultStrategyDeveloperFeeRatio).div(CONST.MAX_BPS);

describe("FeeCollection [@skip-on-coverage]", async () => {
  beforeEach(async () => {
    await setUpFeeCollection();
  });
  describe("Manage Fees", () => {
    it("should have no balance before collection", async () => {
      expect(await usdcContract.balanceOf(feeCollection.address)).to.be.equal(0);
    });

    it("should collect the manage fees", async () => {
      await vault.connect(governance).setVaultCreator(vaultCreator.address);
      await expect(
        feeCollection.connect(await impersonate(vault.address)).collectManageFee(ethers.utils.parseUnits("1000", CONST.TOKENS.USDC.DECIMALS))
      )
        .to.emit(feeCollection, "ManageFeesCollected")
        .withArgs(vault.address, CONST.TOKENS.USDC.ADDRESS, creatorFees, protocolFees);
      expect(await usdcContract.balanceOf(feeCollection.address)).to.be.equal(feeCollected);
    });
  });

  describe("Performance Fees", () => {
    it("should have no balance before collection", async () => {
      expect(await usdcContract.balanceOf(feeCollection.address)).to.be.equal(0);
    });

    it("should collect the performance fees", async () => {
      await strategy.connect(governance).setStrategyDeveloper(developer.address);
      await strategy.connect(governance).setStrategyProposer(proposer.address);
      await expect(feeCollection.connect(await impersonate(vault.address)).collectPerformanceFee(strategy.address, feeCollected))
        .to.emit(feeCollection, "PerformanceFeesCollected")
        .withArgs(strategy.address, CONST.TOKENS.USDC.ADDRESS, proposerFees, developerFees, protocolFees);

      expect(await usdcContract.balanceOf(feeCollection.address)).to.be.equal(feeCollected);
      expect(await feeCollection.connect(developer).feesAvailableForToken(CONST.TOKENS.USDC.ADDRESS)).to.be.equal(developerFees);
    });
  });

  describe("Strategy Reports correct fees", () => {
    const gains = ethers.utils.parseUnits("1000", CONST.TOKENS.USDC.DECIMALS);

    it("should report the correct fees", async () => {
      await vault.connect(await impersonate(strategy.address)).report(gains, 0, 0);
      // Tried to use this to increase the manage fess but it caused other tests to fail
      const protocolWallet = await feeCollection.protocolWallet();
      const availableFeesBefore = await feeCollection
        .connect(await impersonate(protocolWallet))
        .feesAvailableForToken(CONST.TOKENS.USDC.ADDRESS);
      await jumpForward(60 * 60 * 24); // 1 day
      expect(await vault.connect(await impersonate(strategy.address)).report(gains, 0, 0))
        .to.emit(feeCollection, "ManageFeesCollected")
        .to.emit(feeCollection, "PerformanceFeesCollected")
        .withArgs(strategy.address, CONST.TOKENS.USDC.ADDRESS, 0, 0, feeCollected.div(100));
      const availableFeesAfter = await feeCollection.connect(await impersonate(protocolWallet)).feesAvailableForToken(CONST.TOKENS.USDC.ADDRESS);
      const fees = availableFeesAfter.sub(availableFeesBefore).toNumber();
      expect(fees).to.be.closeTo(2190106 + feeCollected.div(100).toNumber(), 100);
    });
  });

  describe("Claim fees", () => {
    it("should have no balance before collection", async () => {
      expect(await usdcContract.balanceOf(developer.address)).to.be.equal(0);
    });

    it("should claim fees available", async () => {
      await strategy.connect(governance).setStrategyDeveloper(developer.address);
      await feeCollection.connect(await impersonate(vault.address)).collectPerformanceFee(strategy.address, feeCollected);
      await expect(feeCollection.connect(developer).claimAllFees())
        .to.emit(feeCollection, "FeesClaimed")
        .withArgs(developer.address, CONST.TOKENS.USDC.ADDRESS, developerFees);
      // Balance on fee contracts should be reduce by the amount claimed
      expect(await usdcContract.balanceOf(feeCollection.address)).to.be.equal(feeCollected.sub(developerFees));
      // Fees available for strategy should be reduced to 0
      expect(await feeCollection.connect(developer).feesAvailableForToken(CONST.TOKENS.USDC.ADDRESS)).to.be.equal(BigNumber.from("0"));
      // developer wallet should be increased by the amount claimed
      expect(await usdcContract.balanceOf(developer.address)).to.be.equal(developerFees);
    });
  });
});

async function setUpFeeCollection() {
  ({ vault, governance, gatekeeper, yopWalletAccount, yopStaking, feeCollection, vaultStrategyDataStore, accessManager } = await setupVault(
    CONST.TOKENS.USDC.ADDRESS
  ));
  [vaultCreator, proposer, developer] = (await ethers.getSigners()).reverse();

  // set management fee to 2%
  vault.connect(governance).setManagementFee(200);

  const strategyFactory = await ethers.getContractFactory("CurveStable");
  strategy = (await strategyFactory.deploy(
    vault.address,
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    CONST.THREE_POOL.ADDRESS
  )) as CurveStable;

  // Need to add eth so users can send transactions
  await setEthBalance(CONST.TOKENS.USDC.WHALE, ethers.utils.parseEther("10"));
  await setEthBalance(vault.address, ethers.utils.parseEther("10"));
  await setEthBalance(strategy.address, ethers.utils.parseEther("10"));

  // Send usdc to the vault and approve, so we have funds to collect
  usdcContract = (await ethers.getContractAt(ERC20ABI, CONST.TOKENS.USDC.ADDRESS)) as ERC20;
  await usdcContract
    .connect(await impersonate(CONST.TOKENS.USDC.WHALE))
    .transfer(vault.address, ethers.utils.parseUnits("100000", CONST.TOKENS.USDC.DECIMALS));
  await usdcContract
    .connect(await impersonate(CONST.TOKENS.USDC.WHALE))
    .transfer(strategy.address, ethers.utils.parseUnits("100000", CONST.TOKENS.USDC.DECIMALS));
  await usdcContract
    .connect(await impersonate(vault.address))
    .approve(feeCollection.address, ethers.utils.parseUnits("1000", CONST.TOKENS.USDC.DECIMALS));

  // add the strategy to the vault
  await vaultStrategyDataStore
    .connect(governance)
    .addStrategy(vault.address, strategy.address, 4000, ethers.constants.Zero, ethers.constants.MaxUint256, 100);

  await vault.connect(governance).unpause();
}
