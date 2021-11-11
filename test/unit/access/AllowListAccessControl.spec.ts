import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { AllowlistAccessControl } from "../../../types";

describe("AllowlistAccessControl", function () {
  let owner: SignerWithAddress;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let addr1: SignerWithAddress;
  let gatekeeper2: SignerWithAddress;
  let addressArray: Array<string>;
  let vaultA: string;
  let vaultB: string;
  let allowlistAccessControl: AllowlistAccessControl;
  let AllowlistAccessControl: ContractFactory;
  beforeEach(async function () {
    AllowlistAccessControl = await ethers.getContractFactory("AllowlistAccessControl");
    [owner, governance, gatekeeper, addr1, gatekeeper2] = await ethers.getSigners();
    addressArray = [addr1.address];
    vaultA = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    vaultB = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    allowlistAccessControl = (await AllowlistAccessControl.deploy(governance.address)) as AllowlistAccessControl;
    await allowlistAccessControl.deployed();
  });

  it("Should return false when access not granted", async function () {
    expect(await allowlistAccessControl.hasAccess(owner.address, vaultA)).to.equal(false);
  });

  it("Should revert when calling hasAccess on invalid address", async function () {
    await expect(allowlistAccessControl.hasAccess(ethers.constants.AddressZero, vaultA)).to.be.revertedWith("invalid user address");
  });

  it("Should revert when calling hasAccess on invalid vault", async function () {
    await expect(allowlistAccessControl.hasAccess(addr1.address, ethers.constants.AddressZero)).to.be.revertedWith("invalid vault address");
  });

  it("Should return true when global access is granted", async function () {
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(false);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultB)).to.equal(false);
    await allowlistAccessControl.connect(governance).allowGlobalAccess(addressArray);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultB)).to.equal(true);
  });

  it("Should return false when global access is granted and then revoked", async function () {
    await allowlistAccessControl.connect(governance).allowGlobalAccess(addressArray);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);

    await allowlistAccessControl.connect(governance).removeGlobalAccess(addressArray);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should return true when vault access is granted", async function () {
    await allowlistAccessControl.connect(governance).setVaultGatekeeper(vaultA, gatekeeper.address);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(false);
    await allowlistAccessControl.connect(gatekeeper).allowVaultAccess(addressArray, vaultA);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);
  });

  it("Should return false when vault access is granted and then revoked", async function () {
    await allowlistAccessControl.connect(governance).allowVaultAccess(addressArray, vaultA);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);

    await allowlistAccessControl.connect(governance).removeVaultAccess(addressArray, vaultA);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should return the correct value when both vault and global access are set", async function () {
    await allowlistAccessControl.connect(governance).allowVaultAccess(addressArray, vaultA);
    await allowlistAccessControl.connect(governance).allowGlobalAccess(addressArray);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);

    await allowlistAccessControl.connect(governance).removeVaultAccess(addressArray, vaultA);
    await allowlistAccessControl.connect(governance).removeGlobalAccess(addressArray);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should not change vault access when adding the same adress twice", async function () {
    await allowlistAccessControl.connect(governance).allowVaultAccess(addressArray, vaultA);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);
    await allowlistAccessControl.connect(governance).allowVaultAccess(addressArray, vaultA);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);
  });

  it("Should not change global access when adding the same adress twice", async function () {
    await allowlistAccessControl.connect(governance).allowGlobalAccess(addressArray);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);
    await allowlistAccessControl.connect(governance).allowGlobalAccess(addressArray);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);
  });

  it("Should revert when calling allowGlobalAccess with invalid address", async function () {
    await expect(allowlistAccessControl.connect(governance).allowGlobalAccess([ethers.constants.AddressZero])).to.be.revertedWith(
      "invalid address"
    );
  });

  it("Should revert when calling allowVaultAccess with user address", async function () {
    await expect(allowlistAccessControl.connect(governance).allowVaultAccess([ethers.constants.AddressZero], vaultA)).to.be.revertedWith(
      "invalid user address"
    );
  });

  it("Should revert when calling allowVaultAccess with invalid vault address", async function () {
    await expect(allowlistAccessControl.connect(governance).allowVaultAccess([addr1.address], ethers.constants.AddressZero)).to.be.revertedWith(
      "invalid vault address"
    );
  });

  it("only governance can set gatekeeper", async () => {
    expect(allowlistAccessControl.connect(addr1).setVaultGatekeeper(vaultA, gatekeeper.address)).to.be.revertedWith("governance only");
    expect(allowlistAccessControl.connect(governance).setVaultGatekeeper(vaultA, gatekeeper.address))
      .to.emit(allowlistAccessControl, "GatekeeperUpdated")
      .withArgs(gatekeeper.address, vaultA);
  });

  it("only gatekeeper of a vault can update allowlist for the vault", async () => {
    await allowlistAccessControl.connect(governance).setVaultGatekeeper(vaultA, gatekeeper.address);
    await allowlistAccessControl.connect(governance).setVaultGatekeeper(vaultB, gatekeeper2.address);
    expect(allowlistAccessControl.connect(gatekeeper).allowVaultAccess([addr1.address], vaultB)).to.be.revertedWith("not authorised");
    expect(await allowlistAccessControl.connect(gatekeeper).allowVaultAccess([addr1.address], vaultA))
      .to.emit(allowlistAccessControl, "VaultAccessGranted")
      .withArgs(addr1.address, vaultA);
    expect(allowlistAccessControl.connect(gatekeeper2).allowVaultAccess([addr1.address], vaultA)).to.be.revertedWith("not authorised");
    expect(await allowlistAccessControl.connect(gatekeeper2).allowVaultAccess([addr1.address], vaultB))
      .to.emit(allowlistAccessControl, "VaultAccessGranted")
      .withArgs(addr1.address, vaultB);
    expect(allowlistAccessControl.connect(gatekeeper).removeVaultAccess([addr1.address], vaultB)).to.be.revertedWith("not authorised");
    expect(await allowlistAccessControl.connect(gatekeeper).removeVaultAccess([addr1.address], vaultA))
      .to.emit(allowlistAccessControl, "VaultAccessRemoved")
      .withArgs(addr1.address, vaultA);
    expect(allowlistAccessControl.connect(gatekeeper2).removeVaultAccess([addr1.address], vaultA)).to.be.revertedWith("not authorised");
    expect(await allowlistAccessControl.connect(gatekeeper2).removeVaultAccess([addr1.address], vaultB))
      .to.emit(allowlistAccessControl, "VaultAccessRemoved")
      .withArgs(addr1.address, vaultB);
  });
});
