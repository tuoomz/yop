import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades, waffle } from "hardhat";
import { BaseVaultMock } from "../../../types/BaseVaultMock";
import { VaultStrategyDataStore } from "../../../types/VaultStrategyDataStore";
import { StrategyMock } from "../../../types/StrategyMock";
import { impersonate } from "../utils/Impersonate";
import { ContractFactory } from "ethers";
import { MockContract } from "ethereum-waffle";
import FeeCollectionABI from "../../../abi/contracts/interfaces/IFeeCollection.sol/IFeeCollection.json";

const { deployMockContract } = waffle;

describe("BaseVault", function () {
  const vaultName = "test vault";
  const vaultSymbol = "tVault";
  const defaultDecimals = 18;
  let BaseVaultMock: ContractFactory;
  let baseVault: BaseVaultMock;
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let feeCollection: MockContract;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let vaultStrategyDataStore: VaultStrategyDataStore;
  let vaultStrategyDataStoreSigner: SignerWithAddress;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, user1, user2] = await ethers.getSigners();
    const VaultStrategyDataStoreContract = await ethers.getContractFactory("VaultStrategyDataStore");
    vaultStrategyDataStore = (await VaultStrategyDataStoreContract.deploy(governance.address)) as VaultStrategyDataStore;
    await vaultStrategyDataStore.deployed();
    vaultStrategyDataStoreSigner = await impersonate(vaultStrategyDataStore.address);
    feeCollection = await deployMockContract(deployer, FeeCollectionABI);
    await feeCollection.mock.collectManageFee.returns();
    await feeCollection.mock.collectPerformanceFee.returns();
    BaseVaultMock = await ethers.getContractFactory("BaseVaultMock");
    baseVault = (await BaseVaultMock.deploy()) as BaseVaultMock;
    await baseVault.deployed();
    await baseVault.initialize(
      vaultName,
      vaultSymbol,
      governance.address,
      gatekeeper.address,
      feeCollection.address,
      vaultStrategyDataStore.address
    );
  });

  describe("initialize", async () => {
    it("can't initialize the contract again", async () => {
      await expect(
        baseVault.initialize(
          vaultName,
          vaultSymbol,
          governance.address,
          gatekeeper.address,
          feeCollection.address,
          vaultStrategyDataStore.address
        )
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("can not set the initial deployer as the governor", async () => {
      const baseVault2 = (await BaseVaultMock.deploy()) as BaseVaultMock;
      await baseVault2.deployed();
      expect(
        baseVault2.initialize(
          vaultName,
          vaultSymbol,
          deployer.address,
          gatekeeper.address,
          feeCollection.address,
          vaultStrategyDataStore.address
        )
      ).to.be.revertedWith("invalid address");
    });

    it("can not set the initial deployer as the gatekeeper", async () => {
      const baseVault2 = (await BaseVaultMock.deploy()) as BaseVaultMock;
      await baseVault2.deployed();
      expect(
        baseVault2.initialize(
          vaultName,
          vaultSymbol,
          governance.address,
          deployer.address,
          feeCollection.address,
          vaultStrategyDataStore.address
        )
      ).to.be.revertedWith("invalid address");
    });

    it("strategyDataStore has to be set", async () => {
      const baseVault2 = (await BaseVaultMock.deploy()) as BaseVaultMock;
      await baseVault2.deployed();
      expect(
        baseVault2.initialize(
          vaultName,
          vaultSymbol,
          governance.address,
          gatekeeper.address,
          feeCollection.address,
          ethers.constants.AddressZero
        )
      ).to.be.revertedWith("!input");
    });
  });

  it("basic information should match", async () => {
    // any users should be able to read these information
    baseVault = baseVault.connect(user1);
    expect(await baseVault.name()).to.equal(vaultName);
    expect(await baseVault.symbol()).to.equal(vaultSymbol);
    expect(await baseVault.decimals()).to.equal(defaultDecimals);
    expect(await baseVault.governance()).to.equal(governance.address);
    expect(await baseVault.gatekeeper()).to.equal(gatekeeper.address);
    expect(await baseVault.feeCollection()).to.equal(feeCollection.address);
    expect(await baseVault.strategyDataStore()).to.equal(vaultStrategyDataStore.address);
    expect(await baseVault.managementFee()).to.equal(0);
    expect(await baseVault.depositLimit()).to.equal(ethers.constants.MaxUint256);
    expect(await baseVault.healthCheck()).to.equal(ethers.constants.AddressZero);
    expect(await baseVault.emergencyShutdown()).to.equal(false);
    expect(await baseVault.activation()).to.gt(ethers.constants.Zero);
    // expect(await baseVault.lockedProfitDegradation()).to.equal(BigNumber.from("46000000000000"));
  });

  it("test setFeeCollection", async () => {
    expect(baseVault.connect(user1).setFeeCollection(user2.address)).to.be.revertedWith("governance only");
    expect(baseVault.connect(gatekeeper).setFeeCollection(user2.address)).to.be.revertedWith("governance only");
    expect(baseVault.connect(governance).setFeeCollection(ethers.constants.AddressZero)).to.be.revertedWith("!input");
    expect(await baseVault.connect(governance).setFeeCollection(user2.address))
      .to.emit(baseVault, "FeeCollectionUpdated")
      .withArgs(user2.address);
    expect(await baseVault.connect(governance).setFeeCollection(user2.address))
      .not.to.emit(baseVault, "FeeCollectionUpdated")
      .withArgs(user2.address);
    expect(await baseVault.feeCollection()).to.equal(user2.address);
  });

  it("test setManagementFee", async () => {
    const newFee = 500;
    expect(baseVault.connect(user1).setManagementFee(500)).to.be.revertedWith("governance only");
    expect(baseVault.connect(gatekeeper).setManagementFee(500)).to.be.revertedWith("governance only");
    expect(baseVault.connect(governance).setManagementFee(11000)).to.be.revertedWith("!input");
    expect(await baseVault.connect(governance).setManagementFee(newFee))
      .to.emit(baseVault, "ManagementFeeUpdated")
      .withArgs(newFee);
    expect(await baseVault.connect(governance).setManagementFee(newFee))
      .not.to.emit(baseVault, "ManagementFeeUpdated")
      .withArgs(newFee);
    expect(await baseVault.managementFee()).to.equal(newFee);
  });

  describe("test setGatekeeper", async () => {
    it("validate inputs", async () => {
      expect(baseVault.connect(user1).setGatekeeper(user2.address)).to.be.revertedWith("governance only");
      expect(baseVault.connect(gatekeeper).setGatekeeper(user2.address)).to.be.revertedWith("governance only");
      expect(baseVault.connect(governance).setGatekeeper(ethers.constants.AddressZero)).to.be.revertedWith("address is not valid");
    });

    it("should update gatekeeper", async () => {
      expect(await baseVault.connect(governance).setGatekeeper(user2.address))
        .to.emit(baseVault, "GatekeeperUpdated")
        .withArgs(user2.address);
      expect(await baseVault.gatekeeper()).to.equal(user2.address);
    });

    it("can not set the same gatekeeper again", async () => {
      await baseVault.connect(governance).setGatekeeper(user2.address);
      expect(baseVault.connect(governance).setGatekeeper(user2.address)).to.be.revertedWith("already the gatekeeper");
    });
  });

  it("test setHealthCheck", async () => {
    expect(baseVault.connect(user1).setHealthCheck(user2.address)).to.be.revertedWith("!authorised");
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
    expect(baseVault.connect(user1).setVaultEmergencyShutdown(true)).to.be.revertedWith("!authorised");
    expect(baseVault.connect(user1).setVaultEmergencyShutdown(false)).to.be.revertedWith("governance only");

    // gatekeeper can shutdown vault
    expect(await baseVault.connect(gatekeeper).setVaultEmergencyShutdown(true))
      .to.emit(baseVault, "EmergencyShutdown")
      .withArgs(true);
    expect(await baseVault.emergencyShutdown()).to.equal(true);
    expect(await baseVault.connect(gatekeeper).setVaultEmergencyShutdown(true))
      .not.to.emit(baseVault, "EmergencyShutdown")
      .withArgs(true);
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
    expect(baseVault.connect(governance).setLockedProfileDegradation(BigNumber.from("2000000000000000000"))).to.be.revertedWith("!value");
    expect(await baseVault.connect(governance).setLockedProfileDegradation(degradation))
      .to.emit(baseVault, "LockedProfitDegradationUpdated")
      .withArgs(degradation);
    expect(await baseVault.connect(governance).setLockedProfileDegradation(degradation))
      .not.to.emit(baseVault, "LockedProfitDegradationUpdated")
      .withArgs(degradation);
  });

  it("test setDepositLimit", async () => {
    const depositLimit = BigNumber.from("10000000000");
    expect(baseVault.connect(user1).setDepositLimit(depositLimit)).to.be.revertedWith("!authorised");
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

  describe("setStrategyDataStore", async () => {
    it("should emit event if strategyDataStore is changed", async () => {
      await expect(await baseVault.setStrategyDataStore(user1.address))
        .to.emit(baseVault, "StrategyDataStoreUpdated")
        .withArgs(user1.address);
    });

    it("should not emit event if strategyDataStore is not changed", async () => {
      await expect(await baseVault.setStrategyDataStore(vaultStrategyDataStore.address)).not.to.emit(baseVault, "StrategyDataStoreUpdated");
    });
  });

  describe("setVaultCreator", async () => {
    it("should revert if set by non governance", async () => {
      expect(baseVault.setVaultCreator(user1.address)).to.be.revertedWith("!authorised");
    });

    it("should change vault creator", async () => {
      expect(await baseVault.creator()).to.equal(ethers.constants.AddressZero);
      await baseVault.connect(governance).setVaultCreator(user1.address);
      expect(await baseVault.creator()).to.equal(user1.address);
    });
  });

  describe("BaseVault strategies", async () => {
    let mockStrategy: StrategyMock;
    let mockStrategySigner: SignerWithAddress;

    beforeEach(async () => {
      const MockStrategy = await ethers.getContractFactory("StrategyMock");
      mockStrategy = (await MockStrategy.deploy(ethers.constants.AddressZero)) as StrategyMock;
      await mockStrategy.deployed();
      mockStrategySigner = await impersonate(mockStrategy.address);
    });

    it("test addStrategy", async () => {
      await baseVault.connect(governance).setVaultEmergencyShutdown(true);
      expect(baseVault.addStrategy(mockStrategy.address)).to.be.revertedWith("emergency shutdown");

      await baseVault.connect(governance).setVaultEmergencyShutdown(false);
      expect(baseVault.connect(governance).addStrategy(mockStrategy.address)).to.be.revertedWith("!strategyStore");
      expect(baseVault.connect(gatekeeper).addStrategy(mockStrategy.address)).to.be.revertedWith("!strategyStore");
      expect(baseVault.connect(user1).addStrategy(mockStrategy.address)).to.be.revertedWith("!strategyStore");
      expect(await baseVault.connect(vaultStrategyDataStoreSigner).addStrategy(mockStrategy.address))
        .to.emit(baseVault, "StrategyAdded")
        .withArgs(mockStrategy.address);
      const strategyInfo = await baseVault.strategy(mockStrategy.address);
      expect(strategyInfo.totalDebt).to.equal(ethers.constants.Zero);
    });

    it("test migrateStrategy", async () => {
      const MockStrategy = await ethers.getContractFactory("StrategyMock");
      const mockStrategy1 = (await MockStrategy.deploy(ethers.constants.AddressZero)) as StrategyMock;
      await mockStrategy1.deployed();
      const info = await baseVault.strategy(mockStrategy.address);
      expect(baseVault.connect(governance).migrateStrategy(mockStrategy.address, mockStrategy1.address)).to.be.revertedWith("!strategyStore");
      expect(baseVault.connect(gatekeeper).migrateStrategy(mockStrategy.address, mockStrategy1.address)).to.be.revertedWith("!strategyStore");
      expect(baseVault.connect(user1).migrateStrategy(mockStrategy.address, mockStrategy1.address)).to.be.revertedWith("!strategyStore");
      expect(await baseVault.connect(vaultStrategyDataStoreSigner).migrateStrategy(mockStrategy.address, mockStrategy1.address))
        .to.emit(baseVault, "StrategyMigrated")
        .withArgs(mockStrategy.address, mockStrategy1.address);
      const migratedInfo = await baseVault.strategy(mockStrategy1.address);
      expect(migratedInfo.activation).to.equal(info.activation);
      expect(migratedInfo.lastReport).to.equal(info.lastReport);
      expect(migratedInfo.totalDebt).to.equal(info.totalDebt);
      expect(info.totalLoss).to.equal(0);
      expect(info.totalGain).to.equal(0);
    });

    it("test revokeStrategy", async () => {
      await vaultStrategyDataStore.connect(governance).addStrategy(baseVault.address, mockStrategy.address, 0, 0, 100, 100);
      expect(baseVault.connect(governance).revokeStrategy()).to.be.revertedWith("!strategy");
      expect(baseVault.connect(gatekeeper).revokeStrategy()).to.be.revertedWith("!strategy");
      expect(await baseVault.connect(mockStrategySigner).revokeStrategy())
        .to.emit(baseVault, "StrategyRevoked")
        .withArgs(mockStrategy.address);
    });

    it("return strategy debt ratio", async () => {
      await vaultStrategyDataStore.connect(governance).addStrategy(baseVault.address, mockStrategy.address, 0, 0, 100, 100);
      const debtRatio = await baseVault.strategyDebtRatio(mockStrategy.address);
      expect(debtRatio).to.equal(ethers.constants.Zero);
    });
  });
});

// the tests are skipped during coverage because the coverage tool will generate constructors which are not allowed by the upgrades library.
// these tests doesn't really affect coverage anyway.
describe("BaseVault Proxy [ @skip-on-coverage ]", async () => {
  const vaultName = "test vault";
  const vaultSymbol = "tVault";
  const defaultDecimals = 18;
  let deployer: SignerWithAddress;
  let baseVault: BaseVaultMock;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let feeCollection: MockContract;
  let user1: SignerWithAddress;
  let vaultStrategyDataStore: VaultStrategyDataStore;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, user1] = await ethers.getSigners();
    const VaultStrategyDataStoreContract = await ethers.getContractFactory("VaultStrategyDataStore");
    vaultStrategyDataStore = (await VaultStrategyDataStoreContract.deploy(governance.address)) as VaultStrategyDataStore;
    await vaultStrategyDataStore.deployed();
    feeCollection = await deployMockContract(deployer, FeeCollectionABI);
    await feeCollection.mock.collectManageFee.returns();
    await feeCollection.mock.collectPerformanceFee.returns();
    const BaseVaultMock = await ethers.getContractFactory("BaseVaultMock");
    const params = [vaultName, vaultSymbol, governance.address, gatekeeper.address, feeCollection.address, vaultStrategyDataStore.address];
    baseVault = (await upgrades.deployProxy(BaseVaultMock, params, { kind: "uups" })) as BaseVaultMock;
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
    expect(await baseVault.feeCollection()).to.equal(feeCollection.address);
    expect(await baseVault.strategyDataStore()).to.equal(vaultStrategyDataStore.address);
    expect(await baseVault.managementFee()).to.equal(0);
    expect(await baseVault.depositLimit()).to.equal(ethers.constants.MaxUint256);
    expect(await baseVault.healthCheck()).to.equal(ethers.constants.AddressZero);
    expect(await baseVault.emergencyShutdown()).to.equal(false);
  });
});
