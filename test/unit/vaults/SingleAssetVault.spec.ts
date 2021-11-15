import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { AllowlistAccessControl } from "../../../types";
import { TokenMock } from "../../../types/TokenMock";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { VaultStrategyDataStore } from "../../../types/VaultStrategyDataStore";
import { StrategyMock } from "../../../types/StrategyMock";
import { HealthCheckMock } from "../../../types/HealthCheckMock";

describe("SingleAssetVault", async () => {
  const name = "test vault";
  const symbol = "tVault";
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let manager: SignerWithAddress;
  let rewards: SignerWithAddress;
  let user: SignerWithAddress;
  let token: TokenMock;
  let strategyDataStore: VaultStrategyDataStore;
  let vault: SingleAssetVault;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, manager, rewards, user] = await ethers.getSigners();
    const MockToken = await ethers.getContractFactory("TokenMock");
    token = (await MockToken.deploy("LosPolosHermanos", "lph")) as TokenMock;
    await token.deployed();

    const StrategyDataStore = await ethers.getContractFactory("VaultStrategyDataStore");
    strategyDataStore = (await StrategyDataStore.deploy(governance.address)) as VaultStrategyDataStore;
    await strategyDataStore.deployed();

    const SingleAssetVault = await ethers.getContractFactory("SingleAssetVault");
    vault = (await SingleAssetVault.deploy(
      name,
      symbol,
      governance.address,
      gatekeeper.address,
      rewards.address,
      strategyDataStore.address,
      token.address
    )) as SingleAssetVault;
    await vault.deployed;
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
      expect(vault.connect(user).unpause()).to.be.revertedWith("not authorised");
    });

    it("gatekeeper can unpause", async () => {
      expect(await vault.connect(gatekeeper).unpause())
        .to.emit(vault, "Unpaused")
        .withArgs(gatekeeper.address);
      expect(await vault.paused()).to.equal(false);
    });

    it("can not unpause the vault again if it's unpaused already", async () => {
      await vault.connect(governance).unpause();
      expect(vault.connect(governance).unpause()).to.be.revertedWith("Pausable: not paused");
    });

    it("governance can unpause the vault", async () => {
      expect(await vault.connect(governance).unpause())
        .to.emit(vault, "Unpaused")
        .withArgs(governance.address);
      expect(await vault.paused()).to.equal(false);
    });
  });

  describe("add access control policy", async () => {
    // just need an address, don't need an actual contract for our tests
    const randomAddress1 = "0x8888888888888888888888888888888888888888";
    const randomAddress2 = "0x9999999999999999999999999999999999999999";
    it("normal user have no access", async () => {
      expect(vault.connect(user).addAccessControlPolicies([randomAddress1])).to.be.revertedWith("not authorised");
    });
    it("gatekeeper can add access control policy", async () => {
      expect(await vault.connect(gatekeeper).addAccessControlPolicies([randomAddress1]))
        .to.emit(vault, "AccessControlPolicyAdded")
        .withArgs(randomAddress1);
    });
    it("governance can add access control policy", async () => {
      expect(await vault.connect(governance).addAccessControlPolicies([randomAddress2]))
        .to.emit(vault, "AccessControlPolicyAdded")
        .withArgs(randomAddress2);
    });
  });

  describe("remove access control policy", async () => {
    const randomAddress = "0x8888888888888888888888888888888888888888";
    beforeEach(async () => {
      await vault.connect(governance).addAccessControlPolicies([randomAddress]);
    });
    it("normal user have no access", async () => {
      expect(vault.connect(user).removeAccessControlPolicies([randomAddress])).to.be.revertedWith("not authorised");
    });
    it("gatekeeper can remove access control policy", async () => {
      expect(await vault.connect(gatekeeper).removeAccessControlPolicies([randomAddress]))
        .to.emit(vault, "AccessControlPolicyRemoved")
        .withArgs(randomAddress);
    });
    it("governance can add access control policy", async () => {
      expect(await vault.connect(governance).removeAccessControlPolicies([randomAddress]))
        .to.emit(vault, "AccessControlPolicyRemoved")
        .withArgs(randomAddress);
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

      beforeEach(async () => {
        const AllowlistAccessControlContract = await ethers.getContractFactory("AllowlistAccessControl");
        allowlistPolicy = (await AllowlistAccessControlContract.deploy(governance.address)) as AllowlistAccessControl;
        await allowlistPolicy.deployed();

        await vault.connect(governance).addAccessControlPolicies([allowlistPolicy.address]);
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
        expect(await vault.balanceOf(rewards.address)).to.be.closeTo(managementFee, 10); // this is to fix intermittent test failures in coverage tests
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
});
