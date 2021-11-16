import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { CommonHealthCheck, StrategyMock } from "../../../types";
import { CustomHealthCheckMock } from "../../../types/CustomHealthCheckMock";
import { impersonate } from "../utils/Impersonate";

describe("CommonHealthCheck", function () {
  const addr0 = ethers.constants.AddressZero;
  const strategy = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const check = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
  const vault = "0x11111111686b45EB94D9688F715815fc0CC0e5Ec";
  let commonHealthCheck: CommonHealthCheck;
  let governance: SignerWithAddress;
  let management: SignerWithAddress;
  let user1: SignerWithAddress;
  let maxBp: BigNumber;
  let invalidRatio: BigNumber;
  let validRatio1: BigNumber;
  let validRatio2: BigNumber;

  beforeEach(async () => {
    [governance, management, user1] = await ethers.getSigners();
    const CommonHealthCheck = await ethers.getContractFactory("CommonHealthCheck");
    commonHealthCheck = (await CommonHealthCheck.deploy()) as CommonHealthCheck;
    await commonHealthCheck.deployed();
  });

  describe("Governance and Management", function () {
    it("should not set governor to 0 address", async () => {
      expect(commonHealthCheck.connect(governance).setGovernance(addr0)).to.be.revertedWith("invalid address");
    });

    it("should be able to set a governor", async () => {
      await commonHealthCheck.connect(governance).setGovernance(user1.address);
      expect(await commonHealthCheck.governance()).to.be.equal(user1.address);
    });

    it("regular user should not be able to set a governor", async () => {
      expect(commonHealthCheck.connect(user1).setGovernance(user1.address)).to.be.revertedWith("!authorized");
    });

    it("should not set management to 0 address", async () => {
      expect(commonHealthCheck.connect(governance).setManagement(addr0)).to.be.revertedWith("invalid address");
    });

    it("should prevent a regular user from setting a manager", async () => {
      expect(commonHealthCheck.connect(user1).setManagement(user1.address)).to.be.revertedWith("!authorized");
    });

    it("should be able to set a manager", async () => {
      await commonHealthCheck.connect(governance).setManagement(user1.address);
      expect(await commonHealthCheck.management()).to.be.equal(user1.address);
    });
  });

  describe("Strategy Limits", function () {
    beforeEach(async () => {
      maxBp = await commonHealthCheck.MAX_BPS();
      invalidRatio = maxBp.add(BigNumber.from(100));
      validRatio1 = maxBp.sub(BigNumber.from(100));
      validRatio2 = maxBp.sub(BigNumber.from(200));
    });

    it("should not set limits with unauthorised user ", async () => {
      expect(commonHealthCheck.connect(user1).setProfitLimitRatio(0)).to.be.revertedWith("!authorized");
      expect(commonHealthCheck.connect(user1).setLossLimitRatio(0)).to.be.revertedWith("!authorized");
    });
    it("should not set an invalid profit limit ratio", async () => {
      expect(commonHealthCheck.connect(governance).setProfitLimitRatio(invalidRatio)).to.be.revertedWith("invalid ratio");
      expect(commonHealthCheck.connect(governance).setStrategyLimits(strategy, invalidRatio, validRatio1)).to.be.revertedWith("invalid ratio");
    });

    it("should not set an invalid loss limit ratio", async () => {
      expect(commonHealthCheck.connect(governance).setLossLimitRatio(invalidRatio)).to.be.revertedWith("invalid ratio");
      expect(commonHealthCheck.connect(governance).setStrategyLimits(strategy, validRatio1, invalidRatio)).to.be.revertedWith("invalid ratio");
    });

    it("should set the profit limit ratio", async () => {
      const profitLimitRatio = 5000;
      await commonHealthCheck.connect(governance).setProfitLimitRatio(profitLimitRatio);
      expect(await commonHealthCheck.profitLimitRatio()).to.be.equal(profitLimitRatio);
    });

    it("should set the loss limit ratio", async () => {
      const lossLimitRatio = 1000;
      await commonHealthCheck.connect(governance).setLossLimitRatio(lossLimitRatio);
      expect(await commonHealthCheck.lossLimitRatio()).to.be.equal(lossLimitRatio);
    });

    it("should set the loss limit ratio", async () => {
      const lossLimitRatio = 1000;
      await commonHealthCheck.connect(governance).setLossLimitRatio(lossLimitRatio);
      expect(await commonHealthCheck.lossLimitRatio()).to.be.equal(lossLimitRatio);
    });

    it("should set the strategy limits", async () => {
      const lossLimitRatio = 1000;
      await commonHealthCheck.connect(governance).setStrategyLimits(strategy, validRatio1, validRatio2);
      expect((await commonHealthCheck.strategiesLimits(strategy)).profitLimitRatio).to.be.equal(validRatio1);
      expect((await commonHealthCheck.strategiesLimits(strategy)).lossLimitRatio).to.be.equal(validRatio2);
    });
  });

  describe("Check", function () {
    let vaultSigner: SignerWithAddress;
    let mockStrategy: StrategyMock;
    let MockStrategy: ContractFactory;
    const debtPayment = 300;
    const debtOutstanding = 400;
    const totalDebt = 500;
    beforeEach(async () => {
      MockStrategy = await ethers.getContractFactory("StrategyMock");
      mockStrategy = (await MockStrategy.deploy(ethers.constants.AddressZero)) as StrategyMock;
      await mockStrategy.deployed();
      await mockStrategy.setVault(vault);
      vaultSigner = await impersonate(vault);
    });

    it("should set check", async () => {
      await commonHealthCheck.connect(governance).setCheck(strategy, check);
      expect(await commonHealthCheck.checks(strategy)).to.be.equal(check);
    });

    it("should enable check", async () => {
      await commonHealthCheck.connect(vaultSigner).enableCheck(mockStrategy.address);
      expect(await commonHealthCheck.disabledCheck(mockStrategy.address)).to.be.equal(false);
    });

    it("should not enable check when called by a non vault signer", async () => {
      expect(commonHealthCheck.connect(user1).enableCheck(mockStrategy.address)).to.be.revertedWith("!authorized");
    });

    it("should disable check", async () => {
      await commonHealthCheck.connect(governance).setDisabledCheck(mockStrategy.address, true);
      expect(await commonHealthCheck.disabledCheck(mockStrategy.address)).to.be.equal(true);
    });

    it("should return correct value for doHealthCheck", async () => {
      await commonHealthCheck.connect(governance).setDisabledCheck(mockStrategy.address, true);
      expect(await commonHealthCheck.doHealthCheck(mockStrategy.address)).to.be.equal(false);
      await commonHealthCheck.connect(governance).setDisabledCheck(mockStrategy.address, false);
      expect(await commonHealthCheck.doHealthCheck(mockStrategy.address)).to.be.equal(true);
    });

    it("should revert check with 0 address", async () => {
      const profit = 0;
      const loss = 0;
      expect(commonHealthCheck.connect(user1).check(addr0, profit, loss, debtOutstanding, debtPayment, totalDebt)).to.be.revertedWith(
        "invalid address"
      );
    });

    it("should return false when profit limit exceeded", async () => {
      const profit = 1000;
      const loss = 0;
      expect(
        await commonHealthCheck.connect(user1).check(mockStrategy.address, profit, loss, debtOutstanding, debtPayment, totalDebt)
      ).to.be.equal(false);
    });
    it("should return false when profit limit exceeded", async () => {
      const profit = 1000;
      const loss = 0;
      expect(
        await commonHealthCheck.connect(user1).check(mockStrategy.address, profit, loss, debtOutstanding, debtPayment, totalDebt)
      ).to.be.equal(false);
    });
    it("should return false when loss limit exceeded", async () => {
      // returns false when the profit greater that (totalDebt * profitLimitRatio)
      const profit = 0;
      const loss = 1000;
      expect(
        await commonHealthCheck.connect(user1).check(mockStrategy.address, profit, loss, debtOutstanding, debtPayment, totalDebt)
      ).to.be.equal(false);
    });
    it("should return true when profit or loss limits not exceeded", async () => {
      const profit = 0;
      const loss = 0;
      expect(
        await commonHealthCheck.connect(user1).check(mockStrategy.address, profit, loss, debtOutstanding, debtPayment, totalDebt)
      ).to.be.equal(true);
    });

    it("should set a the use the optional profit limits", async () => {
      // when we set the limit overrides to 0 the check should return false for a very small profit and loss
      await commonHealthCheck.connect(governance).setStrategyLimits(mockStrategy.address, 0, 0);
      const profit = 1;
      const loss = 1;
      expect(
        await commonHealthCheck.connect(user1).check(mockStrategy.address, profit, loss, debtOutstanding, debtPayment, totalDebt)
      ).to.be.equal(false);
    });
  });

  describe("CustomHealthCheck", function () {
    let customHealthCheck: CustomHealthCheckMock;
    beforeEach(async () => {
      const CustomHealthCheckMock = await ethers.getContractFactory("CustomHealthCheckMock");
      customHealthCheck = (await CustomHealthCheckMock.deploy()) as CustomHealthCheckMock;
      commonHealthCheck.setCheck(strategy, customHealthCheck.address);
    });

    it("should execute custom health check", async () => {
      await customHealthCheck.setResult(true);
      expect(await commonHealthCheck.check(strategy, 0, 0, 0, 0, 0)).to.be.equal(true);
      await customHealthCheck.setResult(false);
      expect(await commonHealthCheck.check(strategy, 0, 0, 0, 0, 0)).to.be.equal(false);
    });
  });
});
