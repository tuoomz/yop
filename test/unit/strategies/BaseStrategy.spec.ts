import { expect } from "chai";
import { ethers, waffle } from "hardhat";
import { setupMockVault } from "../fixtures/setup";
import { BaseStrategyMock } from "../../../types/BaseStrategyMock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockContract } from "ethereum-waffle";
import { impersonate } from "../utils/Impersonate";
import BaseStrategyABI from "../../../abi/contracts/strategies/BaseStrategy.sol/BaseStrategy.json";
import ERC20ABI from "../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
const { loadFixture, deployMockContract } = waffle;

describe("BaseStrategy", async () => {
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let proposer: SignerWithAddress;
  let developer: SignerWithAddress;
  let harvester: SignerWithAddress;
  let rewards: SignerWithAddress;
  let user: SignerWithAddress;
  let user2: SignerWithAddress;
  let mockVault: MockContract;
  let mockStrategyDataStore: MockContract;
  let mockVaultToken: MockContract;
  let strategy: BaseStrategyMock;

  beforeEach(async () => {
    [deployer, governance, harvester, rewards, proposer, developer, user, user2] = await ethers.getSigners();
    ({ mockVault, mockVaultToken, mockStrategyDataStore } = await loadFixture(setupMockVault));
    await mockVault.mock.token.returns(mockVaultToken.address);
    await mockVault.mock.approve.returns(true);
    await mockVault.mock.governance.returns(governance.address);
    await mockVaultToken.mock.allowance.returns(0);
    await mockVaultToken.mock.approve.returns(true);
    const StrategyBaseFactory = await ethers.getContractFactory("BaseStrategyMock");
    strategy = (await StrategyBaseFactory.deploy(mockVault.address, proposer.address, developer.address, harvester.address)) as BaseStrategyMock;
  });

  it("can not init more than once", async () => {
    await expect(strategy.initialize(mockVault.address, proposer.address, developer.address, harvester.address)).to.be.revertedWith(
      "Strategy already initialized"
    );
  });

  describe("basic properties", async () => {
    it("should return name", async () => {
      expect(await strategy.name()).to.not.equal("");
    });
    it("should return version", async () => {
      expect(await strategy.apiVersion()).to.equal("0.0.1");
    });
    it("should return delegated assets", async () => {
      expect(await strategy.delegatedAssets()).to.equal(ethers.constants.Zero);
    });

    it("should support ERC165 spec", async () => {
      // a random interface id so this should fail
      expect(await strategy.supportsInterface("0x1f6e3a4b")).to.equal(false);
      // 0x01ffc9a7 = bytes4(keccak256('supportsInterface(bytes4)'))
      expect(await strategy.supportsInterface("0x01ffc9a7")).to.equal(true);
    });
  });

  describe("setStrategyProposer & setStrategyDeveloper", async () => {
    it("should revert is user is not authorised", async () => {
      await expect(strategy.connect(user).setStrategyProposer(proposer.address)).to.be.revertedWith("!authorized");
      await expect(strategy.connect(user).setStrategyDeveloper(developer.address)).to.be.revertedWith("!authorized");
    });
    it("should revert if address is not valid", async () => {
      await expect(strategy.connect(proposer).setStrategyProposer(ethers.constants.AddressZero)).to.be.revertedWith("! address 0");
      await expect(strategy.connect(proposer).setStrategyDeveloper(ethers.constants.AddressZero)).to.be.revertedWith("! address 0");
    });
    it("should update the strategist", async () => {
      await expect(await strategy.strategyProposer()).to.equal(proposer.address);
      await expect(await strategy.strategyDeveloper()).to.equal(developer.address);
      await expect(await strategy.connect(proposer).setStrategyProposer(user.address))
        .to.emit(strategy, "UpdatedStrategyProposer")
        .withArgs(user.address);
      await expect(await strategy.connect(developer).setStrategyDeveloper(user.address))
        .to.emit(strategy, "UpdatedStrategyDeveloper")
        .withArgs(user.address);
      await expect(await strategy.strategyDeveloper()).to.equal(user.address);
    });

    it("revert if not strategist", async () => {
      await expect(strategy.connect(user).testOnlyStrategist()).to.be.revertedWith("!strategist");
    });

    it("strategist can call", async () => {
      await expect(strategy.connect(proposer).testOnlyStrategist()).not.to.be.reverted;
      await expect(strategy.connect(developer).testOnlyStrategist()).not.to.be.reverted;
    });
  });

  describe("setHarvester", async () => {
    it("should revert is user is not authorised", async () => {
      await expect(strategy.connect(user).setHarvester(harvester.address)).to.be.revertedWith("!authorized");
    });
    it("should revert if address is not valid", async () => {
      await expect(strategy.connect(governance).setHarvester(ethers.constants.AddressZero)).to.be.revertedWith("! address 0");
    });
    it("should update the keeper", async () => {
      await expect(await strategy.harvester()).to.equal(harvester.address);
      await expect(await strategy.connect(governance).setHarvester(user.address))
        .to.emit(strategy, "UpdatedHarvester")
        .withArgs(user.address);
      await expect(await strategy.harvester()).to.equal(user.address);
    });
  });

  describe("setVault", async () => {
    it("should revert is user is not authorised", async () => {
      await expect(strategy.connect(user).setVault(mockVault.address)).to.be.revertedWith("!authorized");
    });
    it("should revert if address is not valid", async () => {
      await expect(strategy.connect(governance).setVault(ethers.constants.AddressZero)).to.be.revertedWith("! address 0");
    });
    it("should update the vault", async () => {
      await expect(await strategy.vault()).to.equal(mockVault.address);
      await expect(await strategy.connect(governance).setVault(user2.address))
        .to.emit(strategy, "UpdatedVault")
        .withArgs(user2.address);
      await expect(await strategy.vault()).to.equal(user2.address);
    });
  });

  describe("setMinReportDelay", async () => {
    it("should revert is user is not authorised", async () => {
      await expect(strategy.connect(user).setMinReportDelay(ethers.constants.Zero)).to.be.revertedWith("!authorized");
    });
    it("should update the minReportDelay", async () => {
      await expect(await strategy.minReportDelay()).to.equal(ethers.constants.Zero);
      await expect(await strategy.connect(governance).setMinReportDelay(100))
        .to.emit(strategy, "UpdatedMinReportDelay")
        .withArgs(100);
      await expect(await strategy.minReportDelay()).to.equal(100);
    });
  });

  describe("setMaxReportDelay", async () => {
    it("should revert is user is not authorised", async () => {
      await expect(strategy.connect(user).setMaxReportDelay(ethers.constants.Zero)).to.be.revertedWith("!authorized");
    });
    it("should update the maxReportDelay", async () => {
      await expect(await strategy.maxReportDelay()).to.equal(86400);
      await expect(await strategy.connect(governance).setMaxReportDelay(43200))
        .to.emit(strategy, "UpdatedMaxReportDelay")
        .withArgs(43200);
      await expect(await strategy.maxReportDelay()).to.equal(43200);
    });
  });

  describe("setProfitFactor", async () => {
    it("should revert is user is not authorised", async () => {
      await expect(strategy.connect(user).setProfitFactor(ethers.constants.Zero)).to.be.revertedWith("!authorized");
    });
    it("should update the profitFactor", async () => {
      await expect(await strategy.profitFactor()).to.equal(100);
      await expect(await strategy.connect(governance).setProfitFactor(0))
        .to.emit(strategy, "UpdatedProfitFactor")
        .withArgs(0);
      await expect(await strategy.profitFactor()).to.equal(0);
    });
  });

  describe("setDebtThreshold", async () => {
    it("should revert is user is not authorised", async () => {
      await expect(strategy.connect(user).setDebtThreshold(ethers.constants.Zero)).to.be.revertedWith("!authorized");
    });
    it("should update the debtThreshold", async () => {
      await expect(await strategy.debtThreshold()).to.equal(0);
      await expect(await strategy.connect(governance).setDebtThreshold(100))
        .to.emit(strategy, "UpdatedDebtThreshold")
        .withArgs(100);
      await expect(await strategy.profitFactor()).to.equal(100);
    });
  });

  describe("setMetadataURI", async () => {
    it("should revert is user is not authorised", async () => {
      await expect(strategy.connect(user).setMetadataURI("")).to.be.revertedWith("!authorized");
    });
    it("should update the metadataURI", async () => {
      await expect(await strategy.metadataURI()).to.equal("");
      await expect(await strategy.connect(governance).setMetadataURI("url"))
        .to.emit(strategy, "UpdatedMetadataURI")
        .withArgs("url");
      await expect(await strategy.metadataURI()).to.equal("url");
    });
  });

  describe("isActive", async () => {
    it("should not active is the strategy debt ratio and total asset is 0", async () => {
      await mockVault.mock.strategyDebtRatio.returns(0);
      expect(await strategy.isActive()).to.equal(false);
    });

    it("should active if the strategy debt ratio or total asset is not 0", async () => {
      await mockVault.mock.strategyDebtRatio.returns(9500);
      expect(await strategy.isActive()).to.equal(true);
    });
  });

  describe("tendTrigger", async () => {
    it("should return value", async () => {
      expect(await strategy.tendTrigger(ethers.constants.Zero)).to.equal(false);
    });
  });

  describe("tend", async () => {
    it("should revert if user is not authorised", async () => {
      await expect(strategy.connect(user).tend()).to.be.revertedWith("!authorized");
    });

    it("should success if user is authorised", async () => {
      await mockVault.mock.debtOutstanding.returns(0);
      await strategy.connect(developer).tend();
    });
  });

  describe("harvestTrigger", async () => {
    const strategyParams = {
      activation: 0,
      lastReport: 0,
      totalDebt: 0,
      totalGain: 0,
      totalLoss: 0,
    };

    it("should return false when strategy is not activated", async () => {
      await mockVault.mock.strategy.returns(strategyParams);
      await expect(await strategy.harvestTrigger(0)).to.equal(false);
    });

    it("should return false if time since last report is less than minReportDelay", async () => {
      const currentTime = 100;
      const lastReport = 90;
      const minReportDelay = 15;
      strategyParams.lastReport = lastReport;
      strategyParams.activation = 1;
      await mockVault.mock.strategy.returns(strategyParams);
      await strategy.setBlockTimestamp(currentTime);
      await strategy.connect(developer).setMinReportDelay(minReportDelay);
      await expect(await strategy.harvestTrigger(0)).to.equal(false);
    });

    it("should return true if time since last report is bigger than maxReportDelay", async () => {
      const currentTime = 100;
      const lastReport = 90;
      const maxReportDelay = 5;
      strategyParams.lastReport = lastReport;
      strategyParams.activation = 1;
      await mockVault.mock.strategy.returns(strategyParams);
      await strategy.setBlockTimestamp(currentTime);
      await strategy.connect(developer).setMaxReportDelay(maxReportDelay);
      await expect(await strategy.harvestTrigger(0)).to.equal(true);
    });

    it("should return true of the outstanding debt is bigger than debtThreshold", async () => {
      const currentTime = 100;
      const lastReport = 90;
      strategyParams.lastReport = lastReport;
      strategyParams.activation = 1;
      await mockVault.mock.strategy.returns(strategyParams);
      await strategy.setBlockTimestamp(currentTime);
      await mockVault.mock.debtOutstanding.returns(100);
      await strategy.connect(developer).setDebtThreshold(50);
      await expect(await strategy.harvestTrigger(0)).to.equal(true);
    });

    it("should return true if there is a loss", async () => {
      const currentTime = 100;
      const lastReport = 90;
      strategyParams.lastReport = lastReport;
      strategyParams.activation = 1;
      strategyParams.totalDebt = 300;
      await mockVault.mock.strategy.returns(strategyParams);
      await strategy.setBlockTimestamp(currentTime);
      await strategy.setTotalAssetValue(0);
      await mockVault.mock.debtOutstanding.returns(100);
      await strategy.connect(developer).setDebtThreshold(200);
      await expect(await strategy.harvestTrigger(0)).to.equal(true);
    });

    it("should return true if gas cost is lower than the gain", async () => {
      const currentTime = 100;
      const lastReport = 90;
      strategyParams.lastReport = lastReport;
      strategyParams.activation = 1;
      strategyParams.totalDebt = 100;
      await mockVault.mock.strategy.returns(strategyParams);
      await strategy.setBlockTimestamp(currentTime);
      await strategy.setTotalAssetValue(300);
      await mockVault.mock.debtOutstanding.returns(100);
      await strategy.connect(developer).setDebtThreshold(200);
      await mockVault.mock.creditAvailable.returns(100);
      await strategy.connect(developer).setProfitFactor(1);
      // credit + profit = 100 + 200 = 300
      // profitFactor * callcost = 1 * 100
      await expect(await strategy.harvestTrigger(100)).to.equal(true);
    });

    it("should return false if gas cost is higher than the gain", async () => {
      const currentTime = 100;
      const lastReport = 90;
      strategyParams.lastReport = lastReport;
      strategyParams.activation = 1;
      strategyParams.totalDebt = 100;
      await mockVault.mock.strategy.returns(strategyParams);
      await strategy.setBlockTimestamp(currentTime);
      await strategy.setTotalAssetValue(300);
      await mockVault.mock.debtOutstanding.returns(100);
      await strategy.connect(developer).setDebtThreshold(200);
      await mockVault.mock.creditAvailable.returns(100);
      await strategy.connect(developer).setProfitFactor(1);
      // credit + profit = 100 + 200 = 300
      // profitFactor * callcost = 1 * 400
      await expect(await strategy.harvestTrigger(400)).to.equal(false);
    });

    it("should return false if gas cost is higher than the credit", async () => {
      const currentTime = 100;
      const lastReport = 90;
      strategyParams.lastReport = lastReport;
      strategyParams.activation = 1;
      strategyParams.totalDebt = 300;
      await mockVault.mock.strategy.returns(strategyParams);
      await strategy.setBlockTimestamp(currentTime);
      await strategy.setTotalAssetValue(300);
      await mockVault.mock.debtOutstanding.returns(100);
      await strategy.connect(developer).setDebtThreshold(200);
      await mockVault.mock.creditAvailable.returns(100);
      await strategy.connect(developer).setProfitFactor(1);
      // credit + profit = 100 + 0 = 100
      // profitFactor * callcost = 1 * 400
      await expect(await strategy.harvestTrigger(400)).to.equal(false);
    });
  });

  describe("harvest", async () => {
    it("should liquidate position and paid all the debt in emergency exit", async () => {
      await mockVault.mock.revokeStrategy.returns();
      await strategy.connect(governance).setEmergencyExit();
      await mockVault.mock.debtOutstanding.returns(100);
      await strategy.setTotalAssetValue(200);
      await strategy.setLiquidateResult(150, 50);
      await mockVault.mock.report.returns(0);
      // profit: 150 - 100 = 50 (debtPayment from liquidation - debtOutstanding)
      const profit = 50;
      // loss: 50 (from liquidation)
      const loss = 50;
      // debtPayment: 100 (pay the outstanding debt)
      const debtPayment = 100;
      // debtOutstanding: 0 (no more debt outstanding reported by the vault)
      const debtOutstanding = 0;
      await expect(await strategy.connect(developer).harvest())
        .to.emit(strategy, "Harvested")
        .withArgs(profit, loss, debtPayment, debtOutstanding);
    });

    it("should liquidate position and not pay all the debt in emergency exit", async () => {
      await mockVault.mock.revokeStrategy.returns();
      await strategy.connect(governance).setEmergencyExit();
      await mockVault.mock.debtOutstanding.returns(200);
      await strategy.setTotalAssetValue(200);
      await strategy.setLiquidateResult(150, 50);
      await mockVault.mock.report.returns(50);
      // no profit as debtOutstanding (200) is greater than debtPayment(150)
      const profit = 0;
      // loss: 50 (from liquidation)
      const loss = 50;
      // debtPayment: 150
      const debtPayment = 150;
      // debtOutstanding: 50
      const debtOutstanding = 50;
      await expect(await strategy.connect(developer).harvest())
        .to.emit(strategy, "Harvested")
        .withArgs(profit, loss, debtPayment, debtOutstanding);
    });

    it("should only report results when not in emergency exit", async () => {
      await mockVault.mock.debtOutstanding.returns(100);
      const profit = 50;
      const loss = 50;
      const debtPayment = 100;
      const debtOutstanding = 0;
      await strategy.setPrepareReturnResults(profit, loss, debtPayment);
      await mockVault.mock.report.returns(debtOutstanding);
      await expect(await strategy.connect(developer).harvest())
        .to.emit(strategy, "Harvested")
        .withArgs(profit, loss, debtPayment, debtOutstanding);
    });
  });

  describe("withdraw", async () => {
    it("should revert is user is not the vault", async () => {
      await expect(strategy.connect(developer).withdraw(100)).to.be.revertedWith("!vault");
    });

    it("should be able to withdraw by the vault", async () => {
      await strategy.setLiquidateResult(100, 0);
      await mockVaultToken.mock.transfer.returns(true);
      await expect(strategy.connect(await impersonate(mockVault.address)).withdraw(100)).not.to.be.reverted;
    });
  });

  describe("migrate", async () => {
    let newStrategy: MockContract;
    beforeEach(async () => {
      newStrategy = await deployMockContract(deployer, BaseStrategyABI);
    });

    it("should revert is user is not the vault", async () => {
      await expect(strategy.connect(developer).migrate(newStrategy.address)).to.be.revertedWith("!authorised");
    });

    it("should revert if vault is already set on the strategy", async () => {
      await newStrategy.mock.vault.returns(strategy.address);
      await expect(strategy.connect(governance).migrate(newStrategy.address)).to.be.revertedWith("invalid vault");
    });

    it("should migrate", async () => {
      await newStrategy.mock.vault.returns(mockVault.address);
      await mockVaultToken.mock.transfer.returns(true);
      await mockVaultToken.mock.balanceOf.returns(100);
      await expect(strategy.connect(await impersonate(mockVault.address)).migrate(newStrategy.address)).not.to.be.reverted;
    });
  });

  describe("setEmergencyExit", async () => {
    it("should revert if user is not authorised", async () => {
      await expect(strategy.connect(user).setEmergencyExit()).to.be.revertedWith("!authorized");
      await expect(strategy.connect(harvester).setEmergencyExit()).to.be.revertedWith("!authorized");
    });

    it("should success if user is authorised", async () => {
      await mockVault.mock.revokeStrategy.returns();
      await expect(await strategy.connect(developer).setEmergencyExit()).to.emit(strategy, "EmergencyExitEnabled");
    });
  });

  describe("sweep", async () => {
    let newToken: MockContract;
    beforeEach(async () => {
      newToken = await deployMockContract(deployer, ERC20ABI);
    });
    it("should revert is user is not authorised", async () => {
      await expect(strategy.connect(user).sweep(newToken.address)).to.be.revertedWith("!authorized");
      await expect(strategy.connect(developer).sweep(newToken.address)).to.be.revertedWith("!authorized");
      await expect(strategy.connect(harvester).sweep(newToken.address)).to.be.revertedWith("!authorized");
    });
    it("should revert if the newToken is the address of want token", async () => {
      await expect(strategy.connect(governance).sweep(mockVaultToken.address)).to.be.revertedWith("!want");
    });
    it("should revert if the newToken is the address of vault shares", async () => {
      await expect(strategy.connect(governance).sweep(mockVault.address)).to.be.revertedWith("!shares");
    });

    it("should revert if the token is protected", async () => {
      await strategy.setProtectedTokens([newToken.address]);
      await expect(strategy.connect(governance).sweep(newToken.address)).to.be.revertedWith("!protected");
    });

    it("should success if token is not protected", async () => {
      await newToken.mock.transfer.returns(true);
      await newToken.mock.balanceOf.returns(100);
      await strategy.setProtectedTokens([mockVaultToken.address]);
      await expect(strategy.connect(governance).sweep(newToken.address)).not.to.be.reverted;
    });
  });
});
