import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, waffle } from "hardhat";
import { MockContract } from "ethereum-waffle";
import { YOPRegistryMock } from "../../../types";
import SingleAssetVaultABI from "../../../abi/contracts/vaults/SingleAssetVaultV2.sol/SingleAssetVaultV2.json";
import ERC20ABI from "../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";

const { deployMockContract } = waffle;

describe("YOPRegistry", async () => {
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let yopRegistry: YOPRegistryMock;
  let vault: MockContract;
  let vaultToken: MockContract;

  beforeEach(async () => {
    [deployer, governance] = await ethers.getSigners();
    vault = await deployMockContract(deployer, SingleAssetVaultABI);
    vaultToken = await deployMockContract(deployer, ERC20ABI);
    await vault.mock.token.returns(vaultToken.address);
    const YOPRegistryFactory = await ethers.getContractFactory("YOPRegistryMock");
    yopRegistry = (await YOPRegistryFactory.deploy()) as YOPRegistryMock;
    await yopRegistry.initialize(governance.address);
  });

  describe("registryVault", async () => {
    it("should revert can called by non-governance", async () => {
      await expect(yopRegistry.connect(deployer).registerVault(vault.address)).to.be.revertedWith("governance only");
    });
    it("should revert if vault address is not valid", async () => {
      await expect(yopRegistry.connect(governance).registerVault(ethers.constants.AddressZero)).to.be.revertedWith("!vault");
    });
    it("should revert if vault is already registered", async () => {
      await yopRegistry.connect(governance).registerVault(vault.address);
      await expect(yopRegistry.connect(governance).registerVault(vault.address)).to.be.revertedWith("registered");
    });
    it("should success", async () => {
      expect(await yopRegistry.currentVault(vaultToken.address)).to.equal(ethers.constants.AddressZero);
      expect(await yopRegistry.isVault(vault.address)).to.equal(false);
      await yopRegistry.connect(governance).registerVault(vault.address);
      expect(await yopRegistry.isVault(vault.address)).to.equal(true);
      expect(await yopRegistry.currentVault(vaultToken.address)).to.equal(vault.address);
    });
  });

  describe("read methods", async () => {
    beforeEach(async () => {
      await yopRegistry.connect(governance).registerVault(vault.address);
    });
    it("should return currentVault", async () => {
      expect(await yopRegistry.currentVault(vaultToken.address)).to.equal(vault.address);
    });
    it("should return vault numbers", async () => {
      expect(await yopRegistry.totalVaults()).to.equal(1);
    });
    it("should return vault token info", async () => {
      expect(await yopRegistry.vaultToken(vault.address)).to.equal(vaultToken.address);
    });
    it("should return isVault info", async () => {
      expect(await yopRegistry.isVault(vault.address)).to.equal(true);
    });
  });

  describe("upgrade", async () => {
    it("should revert if upgrade by non-governance", async () => {
      await expect(yopRegistry.connect(deployer).authorizeUpgrade(yopRegistry.address)).to.be.revertedWith("governance only");
    });

    it("should success if upgrade by governance", async () => {
      await yopRegistry.connect(governance).authorizeUpgrade(yopRegistry.address);
    });
  });
});
