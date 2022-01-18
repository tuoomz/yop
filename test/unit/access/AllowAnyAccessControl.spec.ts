import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockContract } from "ethereum-waffle";
import { expect } from "chai";
import { ethers, waffle } from "hardhat";
import IGatekeeperableABI from "../../../abi/contracts/interfaces/roles/IGatekeeperable.sol/IGatekeeperable.json";
import { AllowAnyAccessControl } from "../../../types/AllowAnyAccessControl";
const { deployMockContract } = waffle;
const ADDRESS_ONE = "0x0000000000000000000000000000000000000001";

describe("AllowAnyAccessControl", async () => {
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let user: SignerWithAddress;
  let vault: MockContract;
  let allowAnyAccessControl: AllowAnyAccessControl;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, user] = await ethers.getSigners();
    const AllowAnyAccessControlFactory = await ethers.getContractFactory("AllowAnyAccessControl");
    allowAnyAccessControl = (await AllowAnyAccessControlFactory.deploy(governance.address)) as AllowAnyAccessControl;
    vault = await deployMockContract(deployer, IGatekeeperableABI);
    await vault.mock.gatekeeper.returns(gatekeeper.address);
  });

  describe("hasAccess", async () => {
    it("should revert if inputs are not valid", async () => {
      await expect(allowAnyAccessControl.hasAccess(ethers.constants.AddressZero, vault.address)).to.be.revertedWith("!input");
      await expect(allowAnyAccessControl.hasAccess(user.address, ethers.constants.AddressZero)).to.be.revertedWith("!input");
    });
  });

  describe("setDefault", async () => {
    it("can only be called by governance", async () => {
      await expect(allowAnyAccessControl.connect(gatekeeper).setDefault(true)).to.be.revertedWith("governance only");
    });

    it("should grant access", async () => {
      expect(await allowAnyAccessControl.connect(user).hasAccess(user.address, vault.address)).equal(false);
      await expect(allowAnyAccessControl.connect(governance).setDefault(true))
        .to.emit(allowAnyAccessControl, "AllowAnyUpdated")
        .withArgs(ADDRESS_ONE, true);
      expect(await allowAnyAccessControl.connect(user).hasAccess(user.address, vault.address)).equal(true);
    });
  });

  describe("setForVaults", async () => {
    it("should revert if vaults are empty", async () => {
      await expect(allowAnyAccessControl.connect(governance).setForVaults([], [])).to.be.revertedWith("!vaults");
    });

    it("should revert if the length of parameters don't match", async () => {
      await expect(allowAnyAccessControl.connect(governance).setForVaults([vault.address], [])).to.be.revertedWith("!input");
    });

    it("should revert if vault address is not valid", async () => {
      await expect(
        allowAnyAccessControl.connect(governance).setForVaults([vault.address, ethers.constants.AddressZero], [true, true])
      ).to.be.revertedWith("!input");
    });

    it("should revert if user is not governance or gatekeeper", async () => {
      await expect(allowAnyAccessControl.connect(user).setForVaults([vault.address], [true])).to.be.revertedWith("not authorised");
    });

    it("should configure for a vault", async () => {
      expect(await allowAnyAccessControl.connect(user).hasAccess(user.address, vault.address)).equal(false);
      await expect(await allowAnyAccessControl.connect(governance).setForVaults([vault.address], [true]))
        .to.emit(allowAnyAccessControl, "AllowAnyUpdated")
        .withArgs(vault.address, true);
      expect(await allowAnyAccessControl.connect(user).hasAccess(user.address, vault.address)).equal(true);
    });

    it("should use the vault level configuration only", async () => {
      await allowAnyAccessControl.connect(governance).setDefault(true);
      expect(await allowAnyAccessControl.connect(user).hasAccess(user.address, vault.address)).equal(true);
      await expect(await allowAnyAccessControl.connect(gatekeeper).setForVaults([vault.address], [false]))
        .to.emit(allowAnyAccessControl, "AllowAnyUpdated")
        .withArgs(vault.address, false);
      expect(await allowAnyAccessControl.connect(user).hasAccess(user.address, vault.address)).equal(false);
    });
  });
});
