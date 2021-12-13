import { BigNumber, utils } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import { AllowlistAccessControl, TokenMock, SingleAssetVault, VaultStrategyDataStore, StrategyMock, HealthCheckMock } from "../../../types";
import { AccessControlManager } from "../../../types/AccessControlManager";
import { YOPVaultRewards } from "../../../types/YOPVaultRewards";

const YOP_CONTRACT_ADDRESS = "0xAE1eaAE3F627AAca434127644371b67B18444051";
const EPOCH_START_TIME = 1640995200; // 2022-1-1-00:00:00 GMT

describe("SingleAssetVault", async () => {
  const name = "test vault";
  const symbol = "tVault";
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let manager: SignerWithAddress;
  let rewards: SignerWithAddress;
  let user: SignerWithAddress;
  let wallet: SignerWithAddress;
  let token: TokenMock;
  let strategyDataStore: VaultStrategyDataStore;
  let vault: SingleAssetVault;
  let yopRewards: YOPVaultRewards;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, manager, rewards, user, wallet] = await ethers.getSigners();
    const MockToken = await ethers.getContractFactory("TokenMock");
    token = (await MockToken.deploy("LosPolosHermanos", "lph")) as TokenMock;
    await token.deployed();

    const StrategyDataStore = await ethers.getContractFactory("VaultStrategyDataStore");
    strategyDataStore = (await StrategyDataStore.deploy(governance.address)) as VaultStrategyDataStore;
    await strategyDataStore.deployed();

    const YOPVaultsRewards = await ethers.getContractFactory("YOPVaultRewards");
    yopRewards = (await YOPVaultsRewards.deploy()) as YOPVaultRewards;
    await yopRewards.initialize(governance.address, wallet.address, YOP_CONTRACT_ADDRESS, EPOCH_START_TIME);
    await yopRewards.deployed();

    const SingleAssetVault = await ethers.getContractFactory("SingleAssetVault");
    vault = (await SingleAssetVault.deploy()) as SingleAssetVault;
    await vault.deployed();
    await vault.initialize(
      name,
      symbol,
      governance.address,
      gatekeeper.address,
      rewards.address,
      strategyDataStore.address,
      token.address,
      ethers.constants.AddressZero,
      yopRewards.address
    );

    yopRewards.connect(governance).setPerVaultRewardsWeight([vault.address], [100]);
  });

  describe("initialize", async () => {
    it("can't initialize the contract again", async () => {
      await expect(
        vault.initialize(
          name,
          symbol,
          governance.address,
          gatekeeper.address,
          rewards.address,
          strategyDataStore.address,
          token.address,
          ethers.constants.AddressZero,
          yopRewards.address
        )
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  describe("test pause", async () => {
    beforeEach(async () => {
      await vault.connect(governance).unpause();
      expect(await vault.paused()).to.equal(false);
    });

    it("normal user have no access", async () => {
      expect(vault.connect(user).pause()).to.be.revertedWith("not authorised");
    });

    it("gatekeeper can pause", async () => {
      expect(await vault.connect(gatekeeper).pause())
        .to.emit(vault, "Paused")
        .withArgs(gatekeeper.address);
      expect(await vault.paused()).to.equal(true);
    });

    it("can not pause the vault again if it's paused already", async () => {
      await vault.connect(governance).pause();
      expect(vault.connect(governance).pause()).to.be.revertedWith("Pausable: paused");
    });

    it("governance can pause the vault", async () => {
      expect(await vault.connect(governance).pause())
        .to.emit(vault, "Paused")
        .withArgs(governance.address);
      expect(await vault.paused()).to.equal(true);
    });
  });

  describe("test unpause", async () => {
    it("normal user have no access", async () => {
      expect(vault.connect(user).unpause()).to.be.revertedWith("governance only");
    });

    it("gatekeeper cannot unpause", async () => {
      expect(vault.connect(gatekeeper).unpause()).to.be.revertedWith("governance only");
    });

    it("governance can unpause the vault", async () => {
      expect(await vault.connect(governance).unpause())
        .to.emit(vault, "Unpaused")
        .withArgs(governance.address);
      expect(await vault.paused()).to.equal(false);
    });

    it("can not unpause the vault again if it's unpaused already", async () => {
      await vault.connect(governance).unpause();
      expect(vault.connect(governance).unpause()).to.be.revertedWith("Pausable: not paused");
    });
  });

  describe("setAccessControlManager", async () => {
    // just need an address, don't need an actual contract for our tests
    const randomAddress1 = "0x8888888888888888888888888888888888888888";
    const randomAddress2 = "0x9999999999999999999999999999999999999999";
    it("normal user have no access", async () => {
      expect(vault.connect(user).setAccessManager(randomAddress1)).to.be.revertedWith("not authorised");
    });
    it("gatekeeper can set access control manager", async () => {
      expect(await vault.connect(gatekeeper).setAccessManager(randomAddress1))
        .to.emit(vault, "AccessManagerUpdated")
        .withArgs(randomAddress1);
    });
    it("governance can set access control manager", async () => {
      expect(await vault.connect(governance).setAccessManager(randomAddress2))
        .to.emit(vault, "AccessManagerUpdated")
        .withArgs(randomAddress2);
    });
    it("should no change if the access manager address is not changed", async () => {
      await vault.connect(governance).setAccessManager(randomAddress2);
      await expect(await vault.connect(governance).setAccessManager(randomAddress2))
        .not.to.emit(vault, "AccessManagerUpdated")
        .withArgs(randomAddress2);
    });
  });

  describe("deposit", () => {
    beforeEach(async () => {
      await vault.connect(governance).unpause();
    });
    it("can not deposit when the vault is paused", async () => {
      await vault.connect(governance).pause();
      expect(vault.connect(user).deposit(ethers.constants.WeiPerEther, user.address)).to.be.revertedWith("Pausable: paused");
    });
    it("can not deposit when the vault is in emergency shutdown", async () => {
      await vault.connect(governance).setVaultEmergencyShutdown(true);
      expect(vault.connect(user).deposit(ethers.constants.WeiPerEther, user.address)).to.be.revertedWith("emergency shutdown");
    });
    it("can not deposit if recipient address is not valid", async () => {
      expect(vault.connect(user).deposit(ethers.constants.WeiPerEther, ethers.constants.AddressZero)).to.be.revertedWith("invalid recipient");
    });
    describe("check access control policy", async () => {
      let allowlistPolicy: AllowlistAccessControl;
      let accessControlManager: AccessControlManager;

      beforeEach(async () => {
        const AllowlistAccessControlContract = await ethers.getContractFactory("AllowlistAccessControl");
        allowlistPolicy = (await AllowlistAccessControlContract.deploy(governance.address)) as AllowlistAccessControl;
        await allowlistPolicy.deployed();

        const AccessControlContract = await ethers.getContractFactory("AccessControlManager");
        accessControlManager = (await AccessControlContract.deploy(governance.address)) as AccessControlManager;
        await accessControlManager.deployed();

        await accessControlManager.connect(governance).addAccessControlPolicies(vault.address, [allowlistPolicy.address]);

        await vault.connect(governance).setAccessManager(accessControlManager.address);
      });

      it("should not allow access if user is not on the allowlist", async () => {
        expect(vault.connect(user).deposit(ethers.constants.WeiPerEther, user.address)).to.be.revertedWith("no access");
      });

      it("should allow access if user is on the allowlist", async () => {
        await allowlistPolicy.connect(governance).allowGlobalAccess([user.address]);
        await token.mint(user.address, ethers.utils.parseEther("2"));
        await token.connect(user).approve(vault.address, ethers.constants.MaxUint256);
        expect(await vault.connect(user).deposit(ethers.constants.WeiPerEther, user.address))
          .to.emit(token, "Transfer")
          .withArgs(user.address, vault.address, ethers.constants.WeiPerEther)
          .to.emit(vault, "Transfer")
          .withArgs(ethers.constants.AddressZero, user.address, ethers.constants.WeiPerEther);
        expect(await token.balanceOf(vault.address)).to.equal(ethers.constants.WeiPerEther);
        expect(await vault.balanceOf(user.address)).to.equal(ethers.constants.WeiPerEther);
      });
    });

    describe("verify the amount of LP token received", async () => {
      beforeEach(async () => {
        await token.mint(user.address, ethers.utils.parseEther("1"));
        await token.connect(user).approve(vault.address, ethers.constants.MaxUint256);
      });

      it("should receive the same amount LP tokens as input for the first deposit", async () => {
        const amountIn = ethers.utils.parseEther("1");
        expect(await vault.connect(user).deposit(ethers.constants.MaxUint256, user.address))
          .to.emit(token, "Transfer")
          .withArgs(user.address, vault.address, amountIn)
          .to.emit(vault, "Transfer")
          .withArgs(ethers.constants.AddressZero, user.address, amountIn);
        expect(await vault.balanceOf(user.address)).to.equal(amountIn);
      });

      it("should receive different amount of LP tokens as input when there is profit made", async () => {
        const amountIn = ethers.utils.parseEther("1");
        await vault.connect(user).deposit(amountIn, user.address);
        expect(await vault.balanceOf(user.address)).to.equal(amountIn);
        // mint some tokens to the vault, as the "profit"
        await token.mint(vault.address, amountIn);
        expect(await token.balanceOf(vault.address)).to.equal(amountIn.add(amountIn));
        expect(await vault.totalSupply()).to.equal(amountIn);
        // for the next deposit, it should only get half of what then put in as the balance of the vault has doubled
        const expectedAmount = ethers.utils.parseEther("0.5");
        await token.mint(user.address, amountIn);
        expect(await vault.connect(user).deposit(amountIn, user.address))
          .to.emit(vault, "Transfer")
          .withArgs(ethers.constants.AddressZero, user.address, expectedAmount);
        expect(await vault.balanceOf(user.address)).to.equal(amountIn.add(expectedAmount));
      });
    });
  });

  describe("withdraw", async () => {
    const maxLoss = BigNumber.from("100");
    beforeEach(async () => {
      await vault.connect(governance).unpause();
    });
    it("can not withdraw when the vault is paused", async () => {
      await vault.connect(governance).pause();
      expect(vault.connect(user).withdraw(ethers.constants.WeiPerEther, user.address, maxLoss)).to.be.revertedWith("Pausable: paused");
    });
    it("can not withdraw when the vault is in emergency shutdown", async () => {
      await vault.connect(governance).setVaultEmergencyShutdown(true);
      expect(vault.connect(user).withdraw(ethers.constants.WeiPerEther, user.address, maxLoss)).to.be.revertedWith("emergency shutdown");
    });
    it("can not withdraw if recipient address is not valid", async () => {
      expect(vault.connect(user).withdraw(ethers.constants.WeiPerEther, ethers.constants.AddressZero, maxLoss)).to.be.revertedWith(
        "invalid recipient"
      );
    });
    it("can not withdraw when the maxLoss value is over the limit", async () => {
      expect(vault.connect(user).withdraw(ethers.constants.WeiPerEther, user.address, BigNumber.from("11000"))).to.be.revertedWith(
        "invalid maxLoss"
      );
    });
    it("can not withdraw when users don't have LP tokens", async () => {
      expect(vault.connect(user).withdraw(ethers.constants.WeiPerEther, user.address, maxLoss)).to.be.revertedWith("no shares");
    });
    describe("verify withdraw values", async () => {
      const amountIn = ethers.utils.parseEther("1");
      beforeEach(async () => {
        await token.mint(user.address, ethers.utils.parseEther("10"));
        await token.connect(user).approve(vault.address, ethers.constants.MaxUint256);
        await vault.connect(user).deposit(amountIn, user.address);
      });

      it("can withdraw when vault has enough tokens", async () => {
        expect(await vault.connect(user).withdraw(amountIn, user.address, maxLoss))
          .to.emit(vault, "Transfer")
          .withArgs(user.address, ethers.constants.AddressZero, amountIn)
          .to.emit(token, "Transfer")
          .withArgs(vault.address, user.address, amountIn);
      });

      describe("withdraw from strategies", async () => {
        let mockStrategy: StrategyMock;
        beforeEach(async () => {
          // deploy the mock strategy
          const MockStrategyContract = await ethers.getContractFactory("StrategyMock");
          mockStrategy = (await MockStrategyContract.deploy(token.address)) as StrategyMock;
          await mockStrategy.deployed();

          // add the mock strategy for the vault
          const sDebtRatio = BigNumber.from("9000"); // 90%
          const sMinDebtPerHarvest = BigNumber.from("0");
          const sMaxDebtPerHarvest = ethers.constants.MaxUint256;
          const sPerformanceFee = BigNumber.from("100"); // 1%
          await strategyDataStore.connect(governance).setVaultManager(vault.address, manager.address);
          await strategyDataStore
            .connect(manager)
            .addStrategy(vault.address, mockStrategy.address, sDebtRatio, sMinDebtPerHarvest, sMaxDebtPerHarvest, sPerformanceFee);
        });

        it("will withdraw from strategies when vault does not have enough tokens", async () => {
          // let the vault allocate the fund to the strategy by report back to the vault
          await mockStrategy.callVault();
          expect(await token.balanceOf(mockStrategy.address)).to.equal(ethers.utils.parseEther("0.9"));
          // withdraw more than what the vault have to trigger the withdraw from the strategies, no loss reported by the strategy
          // make sure that:
          // 1. the tokens are transferred from the strategy to the vault
          // 2. the LP tokens are burnt
          // 3. the tokens are transferred from the vault to the user
          await mockStrategy.setReturnAmount(ethers.utils.parseEther("0.9"));
          expect(await vault.connect(user).withdraw(amountIn, user.address, maxLoss))
            .to.emit(token, "Transfer")
            .withArgs(mockStrategy.address, vault.address, ethers.utils.parseEther("0.9"))
            .to.emit(vault, "Transfer")
            .withArgs(user.address, ethers.constants.AddressZero, amountIn)
            .to.emit(token, "Transfer")
            .withArgs(vault.address, user.address, amountIn);
        });

        it("will not withdraw when loss is over the limit", async () => {
          // allocate some fund first
          await mockStrategy.callVault();
          // set the loss to be more than 1% of 1 ether
          const loss = ethers.utils.parseEther("0.011");
          await mockStrategy.setLoss(loss);
          await mockStrategy.setReturnAmount(ethers.utils.parseEther("0.9").sub(loss));
          expect(vault.connect(user).withdraw(amountIn, user.address, maxLoss)).to.be.revertedWith("loss is over limit");
        });

        it("will withdraw when loss is not over the limit", async () => {
          // allocate some fund first
          await mockStrategy.callVault();
          // set the loss to be less than 1% of 1 ether
          const loss = ethers.utils.parseEther("0.009");
          await mockStrategy.setLoss(loss);
          await mockStrategy.setReturnAmount(ethers.utils.parseEther("0.9").sub(loss));
          expect(await vault.connect(user).withdraw(amountIn, user.address, maxLoss))
            .to.emit(token, "Transfer")
            .withArgs(mockStrategy.address, vault.address, ethers.utils.parseEther("0.891"))
            .to.emit(vault, "Transfer")
            .withArgs(user.address, ethers.constants.AddressZero, amountIn)
            .to.emit(token, "Transfer")
            .withArgs(vault.address, user.address, ethers.utils.parseEther("0.991"));
        });

        it("will withdraw the maximum balance of the vault", async () => {
          // allocate some fund first
          await mockStrategy.callVault();
          // set the loss to be 1% of 1 ether
          const loss = ethers.utils.parseEther("0.01");
          await mockStrategy.setLoss(loss);
          // the strategy should send back (0.9-0.01 = 0.89) eth, but only send back 0.8 instead
          await mockStrategy.setReturnAmount(ethers.utils.parseEther("0.8"));
          // in this case, the vault will only have 0.9 eth, not enough to cover 0.99 eth
          // so the vault should only burn shares that worth 0.91 (include the loss) eth
          // taking into account the loss, the totalSupply of LP token is 1 eth, the total fund in the vault is 0.99 eth
          // so the shares that should be burnt is 0.91/0.99*1 ~= 0.9191919191 eth
          expect(await vault.connect(user).withdraw(amountIn, user.address, maxLoss.mul(2)))
            .to.emit(token, "Transfer")
            .withArgs(mockStrategy.address, vault.address, ethers.utils.parseEther("0.8"))
            .to.emit(vault, "Transfer")
            .withArgs(user.address, ethers.constants.AddressZero, BigNumber.from("919191919191919191"))
            .to.emit(token, "Transfer")
            .withArgs(vault.address, user.address, ethers.utils.parseEther("0.9"));
        });
      });
    });
  });

  describe("test report", async () => {
    const amountIn = ethers.utils.parseEther("1");
    let mockStrategy: StrategyMock;
    let healthCheck: HealthCheckMock;
    beforeEach(async () => {
      await vault.connect(governance).unpause();
      await token.mint(user.address, ethers.utils.parseEther("10"));
      await token.connect(user).approve(vault.address, ethers.constants.MaxUint256);
      await vault.connect(user).deposit(amountIn, user.address);
      // deploy the mock strategy
      const MockStrategyContract = await ethers.getContractFactory("StrategyMock");
      mockStrategy = (await MockStrategyContract.deploy(token.address)) as StrategyMock;
      await mockStrategy.deployed();

      const MockHealthCheck = await ethers.getContractFactory("HealthCheckMock");
      healthCheck = (await MockHealthCheck.deploy()) as HealthCheckMock;
      await healthCheck.deployed();

      await vault.connect(governance).setHealthCheck(healthCheck.address);
    });

    it("should not be able to call the vault if it's not a strategy for the vault", async () => {
      await mockStrategy.setVault(vault.address);
      expect(mockStrategy.callVault()).to.be.revertedWith("invalid strategy");
    });

    describe("report from valid strategy", async () => {
      const sDebtRatio = BigNumber.from("9000"); // 90%
      const sMinDebtPerHarvest = BigNumber.from("0");
      const sMaxDebtPerHarvest = ethers.constants.MaxUint256;
      const sPerformanceFee = BigNumber.from("100"); // 1%
      beforeEach(async () => {
        await vault.connect(governance).setManagementFee(BigNumber.from("200")); // 2%
        // add the mock strategy for the vault
        await strategyDataStore.connect(governance).setVaultManager(vault.address, manager.address);
        await strategyDataStore
          .connect(manager)
          .addStrategy(vault.address, mockStrategy.address, sDebtRatio, sMinDebtPerHarvest, sMaxDebtPerHarvest, sPerformanceFee);
      });

      it("should fail if the strategy doesn't have enough balance", async () => {
        await mockStrategy.setProfit(ethers.utils.parseEther("0.1"));
        await mockStrategy.setDebtPayment(ethers.utils.parseEther("0.1"));
        expect(mockStrategy.callVault()).to.be.revertedWith("not enough balance");
      });

      it("report profit", async () => {
        const profit = ethers.utils.parseEther("0.5");
        await healthCheck.setDoCheck(true);
        // both rewards and strategies should have not fees before hand
        expect(await vault.balanceOf(rewards.address)).to.eq(ethers.constants.Zero);
        expect(await vault.balanceOf(mockStrategy.address)).to.eq(ethers.constants.Zero);
        await mockStrategy.callVault(); // allocate some funds to the strategy first
        await network.provider.send("evm_increaseTime", [1800]);
        await mockStrategy.setProfit(profit);
        await network.provider.send("evm_increaseTime", [1800]); // 1 hour gap between the two reports
        expect(await mockStrategy.callVault())
          .to.emit(vault, "StrategyReported")
          .withArgs(
            mockStrategy.address,
            profit,
            ethers.constants.Zero,
            ethers.constants.Zero,
            profit,
            ethers.constants.Zero,
            ethers.utils.parseEther("0.9"),
            ethers.constants.Zero,
            sDebtRatio
          )
          .to.emit(token, "Transfer")
          .withArgs(mockStrategy.address, vault.address, profit);
        const performanceFee = ethers.utils.parseEther("0.005");
        expect(await vault.balanceOf(mockStrategy.address)).to.eq(performanceFee);
        // management fee = 0.9 * 0.02 * (3600/SECONDS_PER_YEAR) ~= 0.000002053430255
        const managementFee = BigNumber.from("2053430255241");
        expect(await vault.balanceOf(rewards.address)).to.be.closeTo(managementFee, Math.pow(10, 10)); // this is to fix intermittent test failures in coverage tests
        expect(await vault.lockedProfit()).to.eq(profit.sub(performanceFee).sub(managementFee));
      });

      it("report loss", async () => {
        const loss = ethers.utils.parseEther("0.5");
        await healthCheck.setDoCheck(true);
        await mockStrategy.callVault(); // allocate some funds to the strategy first
        await mockStrategy.setLoss(loss);
        expect(await mockStrategy.callVault())
          .to.emit(vault, "StrategyReported")
          .withArgs(
            mockStrategy.address,
            ethers.constants.Zero,
            loss,
            ethers.constants.Zero,
            ethers.constants.Zero,
            loss,
            ethers.utils.parseEther("0.4"),
            ethers.constants.Zero,
            BigNumber.from("4000")
          );
      });

      it("report debt payment", async () => {
        const debtPayment = ethers.utils.parseEther("0.45");
        await mockStrategy.callVault(); // allocate some funds to the strategy first
        await strategyDataStore
          .connect(manager)
          .updateStrategyDebtRatio(vault.address, mockStrategy.address, sDebtRatio.div(ethers.constants.Two));
        await mockStrategy.setDebtPayment(debtPayment);
        expect(await mockStrategy.callVault())
          .to.emit(vault, "StrategyReported")
          .withArgs(
            mockStrategy.address,
            ethers.constants.Zero,
            ethers.constants.Zero,
            debtPayment,
            ethers.constants.Zero,
            ethers.constants.Zero,
            debtPayment,
            ethers.constants.Zero,
            sDebtRatio.div(ethers.constants.Two)
          )
          .to.emit(token, "Transfer")
          .withArgs(mockStrategy.address, vault.address, debtPayment);
      });

      it("should withdraw everything in emergency mode", async () => {
        const debtPayment = ethers.utils.parseEther("0.9");
        await mockStrategy.callVault(); // allocate some funds to the strategy first
        await vault.connect(governance).setVaultEmergencyShutdown(true);
        await mockStrategy.setDebtPayment(debtPayment);
        expect(await mockStrategy.callVault())
          .to.emit(vault, "StrategyReported")
          .withArgs(
            mockStrategy.address,
            ethers.constants.Zero,
            ethers.constants.Zero,
            debtPayment,
            ethers.constants.Zero,
            ethers.constants.Zero,
            ethers.constants.Zero,
            ethers.constants.Zero,
            sDebtRatio
          )
          .to.emit(token, "Transfer")
          .withArgs(mockStrategy.address, vault.address, debtPayment);
      });
    });
  });

  describe("test sweep", () => {
    let otherToken: TokenMock;

    beforeEach(async () => {
      const OtherToken = await ethers.getContractFactory("TokenMock");
      otherToken = (await OtherToken.deploy("HeisenbergToken", "CRYSTAL")) as TokenMock;
      await otherToken.deployed();
    });

    it("Should allow sweep for full amount", async () => {
      await otherToken.mint(vault.address, utils.parseEther("12"));
      const balance = await otherToken.balanceOf(vault.address);
      expect(balance).to.equal(utils.parseEther("12"), "Failed to deposit into token");
      await vault.connect(governance).sweep(otherToken.address, utils.parseEther("12"));
      expect(await otherToken.balanceOf(vault.address)).to.equal(ethers.constants.Zero);
    });

    it("Should only transfer user balance", async () => {
      await otherToken.mint(vault.address, utils.parseEther("12"));
      await expect(await vault.connect(governance).sweep(otherToken.address, utils.parseEther("13")))
        .to.emit(otherToken, "Transfer")
        .withArgs(vault.address, governance.address, utils.parseEther("12"));
    });

    it("Should now allow sweep to not governance", async () => {
      await otherToken.mint(vault.address, utils.parseEther("12"));
      await expect(vault.connect(user).sweep(otherToken.address, utils.parseEther("12"))).to.be.revertedWith("governance only");
    });
  });

  describe("test base init data", () => {
    const vaultDecimals = 18;

    it("Should check initial state", async () => {
      expect(await vault.totalAsset()).to.equal(ethers.constants.Zero);
      expect(await vault.availableDepositLimit()).to.equal(ethers.constants.MaxUint256);
      expect(await vault.maxAvailableShares()).to.equal(ethers.constants.Zero);
      expect(await vault.pricePerShare()).to.equal(BigNumber.from(`${10 ** vaultDecimals}`));
      expect(await vault.totalDebt()).to.equal(ethers.constants.Zero);
      expect(await vault.lockedProfit()).to.equal(ethers.constants.Zero);
    });
  });
  describe("test debtOutstanding", async () => {
    let mockStrategy: StrategyMock;
    beforeEach(async () => {
      // deploy the mock strategy
      const MockStrategyContract = await ethers.getContractFactory("StrategyMock");
      mockStrategy = (await MockStrategyContract.deploy(token.address)) as StrategyMock;
      await mockStrategy.deployed();

      // add the mock strategy for the vault
      const sDebtRatio = BigNumber.from("5000"); // 50%
      const sMinDebtPerHarvest = BigNumber.from("0");
      const sMaxDebtPerHarvest = ethers.constants.MaxUint256;
      const sPerformanceFee = BigNumber.from("100"); // 1%
      await strategyDataStore.connect(governance).setVaultManager(vault.address, manager.address);
      await strategyDataStore
        .connect(manager)
        .addStrategy(vault.address, mockStrategy.address, sDebtRatio, sMinDebtPerHarvest, sMaxDebtPerHarvest, sPerformanceFee);
    });
    it("Should return 0 when strategy debt is at the vault debt limit", async () => {
      await token.mint(vault.address, utils.parseEther("100"));
      // should drawdown 50% of 100eth
      await mockStrategy.callVault();
      expect(await vault.debtOutstanding(mockStrategy.address)).to.equal(ethers.constants.Zero);
    });

    it("Should return 0 when strategy debt is lower than the vault debt limit", async () => {
      await token.mint(vault.address, utils.parseEther("100"));
      // should drawdown 50% of 100eth
      await mockStrategy.callVault();
      // increase debt ratio by 25%
      await strategyDataStore.connect(governance).updateStrategyDebtRatio(vault.address, mockStrategy.address, BigNumber.from("7500"));
      expect(await vault.debtOutstanding(mockStrategy.address)).to.equal(ethers.constants.Zero);
    });

    it("Should check if strategy is past its debt limit and return overage", async () => {
      await token.mint(vault.address, utils.parseEther("100"));
      // should drawdown 50% of 100eth
      await mockStrategy.callVault();

      // outstanding debt should be 0
      expect(await vault.debtOutstanding(mockStrategy.address)).to.equal(ethers.constants.Zero);

      // lower max debt ratio by 50% - from 50% to 25%
      await strategyDataStore.connect(governance).updateStrategyDebtRatio(vault.address, mockStrategy.address, BigNumber.from("2500"));

      // should have 25eth outstanding debt
      expect(await vault.debtOutstanding(mockStrategy.address)).to.equal(utils.parseEther("25"));
    });

    it("Should return totalDebt while in emergency shutdown", async () => {
      await token.mint(vault.address, utils.parseEther("100"));
      // should drawdown 50% of 100eth
      await mockStrategy.callVault();
      // outstanding debt should be 0
      expect(await vault.debtOutstanding(mockStrategy.address)).to.equal(ethers.constants.Zero);

      // lower max debt ratio by 50% - from 50% to 25%
      await strategyDataStore.connect(governance).updateStrategyDebtRatio(vault.address, mockStrategy.address, BigNumber.from("2500"));
      await vault.connect(governance).setVaultEmergencyShutdown(true);
      // in shutdown the outstanding debt should be equal to what strategy drawdown
      expect(await vault.debtOutstanding(mockStrategy.address)).to.equal(utils.parseEther("50"));
    });
  });

  describe("test creditAvailable", async () => {
    let mockStrategy: StrategyMock;
    beforeEach(async () => {
      // deploy the mock strategy
      const MockStrategyContract = await ethers.getContractFactory("StrategyMock");
      mockStrategy = (await MockStrategyContract.deploy(token.address)) as StrategyMock;
      await mockStrategy.deployed();

      // add the mock strategy for the vault
      const sDebtRatio = BigNumber.from("5000"); // 50%
      const sMinDebtPerHarvest = BigNumber.from("0");
      const sMaxDebtPerHarvest = ethers.constants.MaxUint256;
      const sPerformanceFee = BigNumber.from("100"); // 1%
      await strategyDataStore.connect(governance).setVaultManager(vault.address, manager.address);
      await strategyDataStore
        .connect(manager)
        .addStrategy(vault.address, mockStrategy.address, sDebtRatio, sMinDebtPerHarvest, sMaxDebtPerHarvest, sPerformanceFee);
    });

    it("should return max allowed by debtRatio", async () => {
      await token.mint(vault.address, utils.parseEther("100"));
      expect(await vault.creditAvailable(mockStrategy.address)).to.equal(utils.parseEther("50"));
    });

    it("should return 0 while in emergency shutdown", async () => {
      await token.mint(vault.address, utils.parseEther("100"));
      expect(await vault.creditAvailable(mockStrategy.address)).to.equal(utils.parseEther("50"));
      await vault.connect(governance).setVaultEmergencyShutdown(true);
      expect(await vault.creditAvailable(mockStrategy.address)).to.equal(ethers.constants.Zero);
    });

    it("should return 0 while strategy has outstandingDebt", async () => {
      await token.mint(vault.address, utils.parseEther("100"));
      // should drawdown 50% of 100eth
      await mockStrategy.callVault();

      // lower max debt ratio by 50% - from 50% to 25%
      await strategyDataStore.connect(governance).updateStrategyDebtRatio(vault.address, mockStrategy.address, BigNumber.from("2500"));

      // should have 25eth outstanding debt
      expect(await vault.debtOutstanding(mockStrategy.address)).to.equal(utils.parseEther("25"));
      expect(await vault.creditAvailable(mockStrategy.address)).to.equal(ethers.constants.Zero);
    });

    it("should return 0 available balance is less than strategyMinDebtPerHarvest_", async () => {
      await token.mint(vault.address, utils.parseEther("100"));
      await strategyDataStore.connect(governance).updateStrategyMinDebtHarvest(vault.address, mockStrategy.address, utils.parseEther("51"));
      expect(await vault.creditAvailable(mockStrategy.address)).to.equal(ethers.constants.Zero);
    });

    describe("should return lower of available and strategyMaxDebtPerHarvest_", async () => {
      it("available is lower", async () => {
        await token.mint(vault.address, utils.parseEther("100"));
        await strategyDataStore.connect(governance).updateStrategyMinDebtHarvest(vault.address, mockStrategy.address, utils.parseEther("23"));
        await strategyDataStore.connect(governance).updateStrategyMaxDebtHarvest(vault.address, mockStrategy.address, utils.parseEther("27"));
        await mockStrategy.callVault();
        expect(await vault.creditAvailable(mockStrategy.address)).to.equal(utils.parseEther("23"));
      });
      it("strategyMaxDebtPerHarvest is lower", async () => {
        await token.mint(vault.address, utils.parseEther("100"));
        await strategyDataStore.connect(governance).updateStrategyMinDebtHarvest(vault.address, mockStrategy.address, utils.parseEther("13"));
        await strategyDataStore.connect(governance).updateStrategyMaxDebtHarvest(vault.address, mockStrategy.address, utils.parseEther("15"));
        await mockStrategy.callVault();
        expect(await vault.creditAvailable(mockStrategy.address)).to.equal(utils.parseEther("15"));
      });
    });
  });

  describe("test expectedReturn", async () => {
    let mockStrategy: StrategyMock;

    beforeEach(async () => {
      // deploy the mock strategy
      const MockStrategyContract = await ethers.getContractFactory("StrategyMock");
      mockStrategy = (await MockStrategyContract.deploy(token.address)) as StrategyMock;
      await mockStrategy.deployed();

      // add the mock strategy for the vault
      const sDebtRatio = BigNumber.from("5000"); // 50%
      const sMinDebtPerHarvest = BigNumber.from("0");
      const sMaxDebtPerHarvest = ethers.constants.MaxUint256;
      const sPerformanceFee = BigNumber.from("100"); // 1%
      await strategyDataStore.connect(governance).setVaultManager(vault.address, manager.address);
      await strategyDataStore
        .connect(manager)
        .addStrategy(vault.address, mockStrategy.address, sDebtRatio, sMinDebtPerHarvest, sMaxDebtPerHarvest, sPerformanceFee);
    });

    it("should return 0 for new strategy", async () => {
      expect(await vault.expectedReturn(mockStrategy.address)).to.equal(ethers.constants.Zero);
    });

    it("should return positive expected profit", async () => {
      const profit = ethers.utils.parseEther("3");
      await token.mint(vault.address, utils.parseEther("100"));

      await mockStrategy.callVault();
      await mockStrategy.setProfit(profit);
      await mockStrategy.callVault();
      await network.provider.send("evm_increaseTime", [1800]);
      await network.provider.send("evm_mine");

      // formula for expected profit is profit * msSinceLastHarvest / (lastReportTimestamp - StrategyActivationTimestamp)
      // because it is time based we set min and max approximate values and check if returned value is within the range
      // 1800 because we moved chain time by 1800ms
      // on local system (lastReportTimestamp - StrategyActivationTimestamp) is usually 4, making range for 2 to 6 adds more reliability for testing on other systems.
      const expectedMinValue = profit.mul(1800).div(6);
      const expectedMaxValue = profit.mul(1800).div(2);
      const res = await vault.expectedReturn(mockStrategy.address);
      expect(res).to.be.gt(expectedMinValue).and.to.be.lt(expectedMaxValue);
    });
  });

  describe("test version", async () => {
    it("should return version information", async () => {
      expect(await vault.version()).to.equal("0.1.0");
    });
  });
});

// the tests are skipped during coverage because the coverage tool will generate constructors which are not allowed by the upgrades library.
// these tests doesn't really affect coverage anyway.
describe("SingleAssetVault proxy [ @skip-on-coverage ]", async () => {
  const vaultName1 = "vaultA";
  const vaultSymbol1 = "va";
  const vaultName2 = "vaultA";
  const vaultSymbol2 = "vb";
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let manager: SignerWithAddress;
  let rewards: SignerWithAddress;
  let user: SignerWithAddress;
  let wallet: SignerWithAddress;
  let token1: TokenMock;
  let token2: TokenMock;
  let strategyDataStore: VaultStrategyDataStore;
  let vault1: SingleAssetVault;
  let vault2: SingleAssetVault;
  let yopRewards: YOPVaultRewards;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, manager, rewards, user, wallet] = await ethers.getSigners();
    const MockToken = await ethers.getContractFactory("TokenMock");
    token1 = (await MockToken.deploy("LosPolosHermanos", "lph")) as TokenMock;
    await token1.deployed();
    token2 = (await MockToken.deploy("HeisenbergToken", "hbt")) as TokenMock;
    await token2.deployed();

    const StrategyDataStore = await ethers.getContractFactory("VaultStrategyDataStore");
    strategyDataStore = (await StrategyDataStore.deploy(governance.address)) as VaultStrategyDataStore;
    await strategyDataStore.deployed();

    const YOPVaultsRewards = await ethers.getContractFactory("YOPVaultRewards");
    yopRewards = (await YOPVaultsRewards.deploy()) as YOPVaultRewards;
    await yopRewards.initialize(governance.address, wallet.address, YOP_CONTRACT_ADDRESS, EPOCH_START_TIME);
    await yopRewards.deployed();

    const SingleAssetVault = await ethers.getContractFactory("SingleAssetVault");
    const params1 = [
      vaultName1,
      vaultSymbol1,
      governance.address,
      gatekeeper.address,
      rewards.address,
      strategyDataStore.address,
      token1.address,
      ethers.constants.AddressZero,
      yopRewards.address,
    ];
    vault1 = (await upgrades.deployProxy(SingleAssetVault, params1, { kind: "uups" })) as SingleAssetVault;
    await vault1.deployed();
    const params2 = [
      vaultName2,
      vaultSymbol2,
      governance.address,
      gatekeeper.address,
      rewards.address,
      strategyDataStore.address,
      token2.address,
      ethers.constants.AddressZero,
      yopRewards.address,
    ];
    vault2 = (await upgrades.deployProxy(SingleAssetVault, params2, { kind: "uups" })) as SingleAssetVault;
    await vault2.deployed();
  });

  it("two vaults should have different properties", async () => {
    expect(await vault1.name()).to.equal(vaultName1);
    expect(await vault1.symbol()).to.equal(vaultSymbol1);
    expect(await vault1.token()).to.equal(token1.address);
    expect(await vault2.name()).to.equal(vaultName2);
    expect(await vault2.symbol()).to.equal(vaultSymbol2);
    expect(await vault2.token()).to.equal(token2.address);
  });

  it("only governance can upgrade", async () => {
    let SingleAssetVaultV2Mock = await ethers.getContractFactory("SingleAssetVaultV2Mock");
    await expect(upgrades.upgradeProxy(vault1, SingleAssetVaultV2Mock)).to.be.revertedWith("governance only");
    // see https://forum.openzeppelin.com/t/execute-upgrade-using-different-signer/14264
    SingleAssetVaultV2Mock = await ethers.getContractFactory("SingleAssetVaultV2Mock", governance);
    const vaultv2 = await upgrades.upgradeProxy(vault1, SingleAssetVaultV2Mock);
    expect(await vaultv2.version()).to.equal("2.0.0");
  });
});
