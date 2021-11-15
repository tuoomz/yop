import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { BaseVaultMock } from "../../../types/BaseVaultMock";
import { VaultStrategyDataStore } from "../../../types/VaultStrategyDataStore";
import { MockStrategy } from "../../../types/MockStrategy";

// this is useful to send transactions on behalf of a contract (or any account really).
// It only works for hardhat network.
async function impersonate(account: string): Promise<SignerWithAddress> {
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [account],
  });
  const signer = await ethers.getSigner(account);

  await network.provider.send("hardhat_setBalance", [
    account,
    "0x100000000000000000", // 2.9514791e+20 wei
  ]);

  return signer;
}

describe("BaseVault", function () {
  const vaultName = "test vault";
  const vaultSymbol = "tVault";
  const defaultDecimals = 18;
  let baseVault: BaseVaultMock;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let rewards: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async () => {
    [, governance, gatekeeper, rewards, user1, user2] = await ethers.getSigners();
    const BaseVaultMock = await ethers.getContractFactory("BaseVaultMock");
    baseVault = (await BaseVaultMock.deploy(
      vaultName,
      vaultSymbol,
      governance.address,
      gatekeeper.address,
      rewards.address,
      ethers.constants.AddressZero
    )) as BaseVaultMock;
    await baseVault.deployed();
  });

  it("basic information should match", async () => {
    // any users should be able to read these information
    baseVault = baseVault.connect(user1);
    expect(await baseVault.name()).to.equal(vaultName);
    expect(await baseVault.symbol()).to.equal(vaultSymbol);
    expect(await baseVault.decimals()).to.equal(defaultDecimals);
    expect(await baseVault.governance()).to.equal(governance.address);
    expect(await baseVault.gatekeeper()).to.equal(gatekeeper.address);
    expect(await baseVault.rewards()).to.equal(rewards.address);
    expect(await baseVault.strategyDataStore()).to.equal(ethers.constants.AddressZero);
    expect(await baseVault.managementFee()).to.equal(0);
    expect(await baseVault.depositLimit()).to.equal(ethers.constants.MaxUint256);
    expect(await baseVault.healthCheck()).to.equal(ethers.constants.AddressZero);
    expect(await baseVault.emergencyShutdown()).to.equal(false);
    expect(await baseVault.lockedProfitDegradation()).to.equal(BigNumber.from("46000000000000"));
  });

  it("test setRewards", async () => {
    expect(baseVault.connect(user1).setRewards(user2.address)).to.be.revertedWith("governance only");
    expect(baseVault.connect(gatekeeper).setRewards(user2.address)).to.be.revertedWith("governance only");
    expect(await baseVault.connect(governance).setRewards(user2.address))
      .to.emit(baseVault, "RewardsUpdated")
      .withArgs(user2.address);
    expect(await baseVault.rewards()).to.equal(user2.address);
  });

  it("test setManagementFee", async () => {
    const newFee = 500;
    expect(baseVault.connect(user1).setManagementFee(500)).to.be.revertedWith("governance only");
    expect(baseVault.connect(gatekeeper).setManagementFee(500)).to.be.revertedWith("governance only");
    expect(baseVault.connect(governance).setManagementFee(11000)).to.be.revertedWith("invalid management fee");
    expect(await baseVault.connect(governance).setManagementFee(newFee))
      .to.emit(baseVault, "ManagementFeeUpdated")
      .withArgs(newFee);
    expect(await baseVault.managementFee()).to.equal(newFee);
  });

  it("test setGatekeeper", async () => {
    expect(baseVault.connect(user1).setGatekeeper(user2.address)).to.be.revertedWith("governance only");
    expect(baseVault.connect(gatekeeper).setGatekeeper(user2.address)).to.be.revertedWith("governance only");
    expect(baseVault.connect(governance).setGatekeeper(ethers.constants.AddressZero)).to.be.revertedWith("invalid gatekeeper");
    expect(await baseVault.connect(governance).setGatekeeper(user2.address))
      .to.emit(baseVault, "GatekeeperUpdated")
      .withArgs(user2.address);
    expect(await baseVault.gatekeeper()).to.equal(user2.address);
  });

  it("test setStrategyDataStore", async () => {
    expect(baseVault.connect(user1).setStrategyDataStore(user2.address)).to.be.revertedWith("governance only");
    expect(baseVault.connect(gatekeeper).setStrategyDataStore(user2.address)).to.be.revertedWith("governance only");
    expect(baseVault.connect(governance).setStrategyDataStore(ethers.constants.AddressZero)).to.be.revertedWith("invalid strategy manager");
    expect(await baseVault.connect(governance).setStrategyDataStore(user2.address))
      .to.emit(baseVault, "StrategyDataStoreUpdated")
      .withArgs(user2.address);
    expect(await baseVault.strategyDataStore()).to.equal(user2.address);
  });

  it("test setHealthCheck", async () => {
    expect(baseVault.connect(user1).setHealthCheck(user2.address)).to.be.revertedWith("not authorised");
    // gatekeeper is allowed
    expect(await baseVault.connect(gatekeeper).setHealthCheck(user2.address))
      .to.emit(baseVault, "HealthCheckUpdated")
      .withArgs(user2.address);
    expect(await baseVault.healthCheck()).to.equal(user2.address);
    // governance is allowed to, but since the address is not change, nothing will happen
    expect(await baseVault.connect(governance).setHealthCheck(user2.address))
      .not.to.emit(baseVault, "HealthCheckUpdated")
      .withArgs(user2.address);
    // set to zero address is allowed to disable the check
    expect(await baseVault.connect(governance).setHealthCheck(ethers.constants.AddressZero))
      .to.emit(baseVault, "HealthCheckUpdated")
      .withArgs(ethers.constants.AddressZero);
  });

  it("test setVaultEmergencyShutdown", async () => {
    expect(baseVault.connect(user1).setVaultEmergencyShutdown(true)).to.be.revertedWith("not authorised");
    expect(baseVault.connect(user1).setVaultEmergencyShutdown(false)).to.be.revertedWith("governance only");

    // gatekeeper can shutdown vault
    expect(await baseVault.connect(gatekeeper).setVaultEmergencyShutdown(true))
      .to.emit(baseVault, "EmergencyShutdown")
      .withArgs(true);
    expect(await baseVault.emergencyShutdown()).to.equal(true);
    // gatekeeper can't turn off emergency mode
    expect(baseVault.connect(gatekeeper).setVaultEmergencyShutdown(false)).to.be.revertedWith("governance only");

    expect(await baseVault.connect(governance).setVaultEmergencyShutdown(false))
      .to.emit(baseVault, "EmergencyShutdown")
      .withArgs(false);
    expect(await baseVault.emergencyShutdown()).to.equal(false);
  });

  it("test setLockedProfileDegradation", async () => {
    const degradation = BigNumber.from("23000000000000");
    expect(baseVault.connect(user1).setLockedProfileDegradation(degradation)).to.be.revertedWith("governance only");
    expect(baseVault.connect(gatekeeper).setLockedProfileDegradation(degradation)).to.be.revertedWith("governance only");
    expect(baseVault.connect(governance).setLockedProfileDegradation(BigNumber.from("2000000000000000000"))).to.be.revertedWith(
      "degradation value is too large"
    );
    expect(await baseVault.connect(governance).setLockedProfileDegradation(degradation))
      .to.emit(baseVault, "LockedProfitDegradationUpdated")
      .withArgs(degradation);
  });

  it("test setDepositLimit", async () => {
    const depositLimit = BigNumber.from("10000000000");
    expect(baseVault.connect(user1).setDepositLimit(depositLimit)).to.be.revertedWith("not authorised");
    // gatekeeper is allowed
    expect(await baseVault.connect(gatekeeper).setDepositLimit(depositLimit))
      .to.emit(baseVault, "DepositLimitUpdated")
      .withArgs(depositLimit);
    expect(await baseVault.depositLimit()).to.equal(depositLimit);
    // governance is allowed to, but since the address is not change, nothing will happen
    expect(await baseVault.connect(governance).setDepositLimit(depositLimit))
      .not.to.emit(baseVault, "DepositLimitUpdated")
      .withArgs(depositLimit);
    // set to zero address is allowed to disable the check
    expect(await baseVault.connect(governance).setDepositLimit(ethers.constants.MaxUint256))
      .to.emit(baseVault, "DepositLimitUpdated")
      .withArgs(ethers.constants.MaxUint256);
  });

  describe("BaseVault strategies", async () => {
    let vaultStrategyDataStore: VaultStrategyDataStore;
    let vaultStrategyDataStoreSigner: SignerWithAddress;
    let mockStrategy: MockStrategy;
    let mockStrategySigner: SignerWithAddress;

    beforeEach(async () => {
      const VaultStrategyDataStoreContract = await ethers.getContractFactory("VaultStrategyDataStore");
      vaultStrategyDataStore = (await VaultStrategyDataStoreContract.deploy(governance.address)) as VaultStrategyDataStore;
      await vaultStrategyDataStore.deployed();
      vaultStrategyDataStoreSigner = await impersonate(vaultStrategyDataStore.address);

      const MockStrategy = await ethers.getContractFactory("MockStrategy");
      mockStrategy = (await MockStrategy.deploy(ethers.constants.AddressZero)) as MockStrategy;
      await mockStrategy.deployed();
      mockStrategySigner = await impersonate(mockStrategy.address);
      // add the datastore to the vault
      await baseVault.connect(governance).setStrategyDataStore(vaultStrategyDataStore.address);
    });

    it("test addStrategy", async () => {
      await baseVault.connect(governance).setVaultEmergencyShutdown(true);
      expect(baseVault.addStrategy(mockStrategy.address)).to.be.revertedWith("emergency shutdown");

      await baseVault.connect(governance).setVaultEmergencyShutdown(false);
      expect(baseVault.connect(governance).addStrategy(mockStrategy.address)).to.be.revertedWith("only strategy store");
      expect(baseVault.connect(gatekeeper).addStrategy(mockStrategy.address)).to.be.revertedWith("only strategy store");
      expect(baseVault.connect(user1).addStrategy(mockStrategy.address)).to.be.revertedWith("only strategy store");
      expect(await baseVault.connect(vaultStrategyDataStoreSigner).addStrategy(mockStrategy.address))
        .to.emit(baseVault, "StrategyAdded")
        .withArgs(mockStrategy.address);
    });

    it("test migrateStrategy", async () => {
      const MockStrategy = await ethers.getContractFactory("MockStrategy");
      const mockStrategy1 = (await MockStrategy.deploy(ethers.constants.AddressZero)) as MockStrategy;
      await mockStrategy1.deployed();
      expect(baseVault.connect(governance).migrateStrategy(mockStrategy.address, mockStrategy1.address)).to.be.revertedWith(
        "only strategy store"
      );
      expect(baseVault.connect(gatekeeper).migrateStrategy(mockStrategy.address, mockStrategy1.address)).to.be.revertedWith(
        "only strategy store"
      );
      expect(baseVault.connect(user1).migrateStrategy(mockStrategy.address, mockStrategy1.address)).to.be.revertedWith("only strategy store");
      expect(await baseVault.connect(vaultStrategyDataStoreSigner).migrateStrategy(mockStrategy.address, mockStrategy1.address))
        .to.emit(baseVault, "StrategyMigrated")
        .withArgs(mockStrategy.address, mockStrategy1.address);
    });

    it("test revokeStrategy", async () => {
      await vaultStrategyDataStore.connect(governance).addStrategy(baseVault.address, mockStrategy.address, 0, 0, 100, 100);
      expect(baseVault.connect(governance).revokeStrategy()).to.be.revertedWith("not authorised");
      expect(baseVault.connect(gatekeeper).revokeStrategy()).to.be.revertedWith("not authorised");
      expect(await baseVault.connect(mockStrategySigner).revokeStrategy())
        .to.emit(baseVault, "StrategyRevoked")
        .withArgs(mockStrategy.address);
    });
  });
});
