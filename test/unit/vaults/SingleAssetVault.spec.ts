import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { AllowlistAccessControl } from "../../../types";
import { LosPolosHermanosTokenMock } from "../../../types/LosPolosHermanosTokenMock";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { VaultStrategyDataStore } from "../../../types/VaultStrategyDataStore";

describe("SingleAssetVault", async () => {
  const name = "test vault";
  const symbol = "tVault";
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let manager: SignerWithAddress;
  let rewards: SignerWithAddress;
  let user: SignerWithAddress;
  let token: LosPolosHermanosTokenMock;
  let strategyDataStore: VaultStrategyDataStore;
  let vault: SingleAssetVault;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, manager, rewards, user] = await ethers.getSigners();
    const MockToken = await ethers.getContractFactory("LosPolosHermanosTokenMock");
    token = (await MockToken.deploy("LosPolosHermanos", "lph")) as LosPolosHermanosTokenMock;
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
        await token.mint(user.address, ethers.utils.parseEther("10"));
        await token.connect(user).approve(vault.address, ethers.constants.MaxUint256);
      });

      it("should receive the same amount LP tokens as input for the first deposit", async () => {
        const amountIn = ethers.utils.parseEther("1");
        expect(await vault.connect(user).deposit(amountIn, user.address))
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
        expect(await vault.connect(user).deposit(amountIn, user.address))
          .to.emit(vault, "Transfer")
          .withArgs(ethers.constants.AddressZero, user.address, expectedAmount);
        expect(await vault.balanceOf(user.address)).to.equal(amountIn.add(expectedAmount));
      });
    });
  });
});
