import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { AllowlistAccessControl } from "../../../types";
import { AccessControlManager } from "../../../types/AccessControlManager";

async function policySize(accessControlManager: AccessControlManager, vault: string) {
  return (await accessControlManager.getAccessControlPolicies(vault)).length;
}

describe("AccessControlManager", function () {
  let owner: SignerWithAddress;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let vaultA: string;
  let vaultB: string;
  let accessControl1: AllowlistAccessControl;
  let accessControl2: AllowlistAccessControl;
  let AccessControl: ContractFactory;
  let accessControlManager: AccessControlManager;
  let AccessControlManager: ContractFactory;

  beforeEach(async function () {
    [owner, governance, gatekeeper, addr1, addr2] = await ethers.getSigners();
    vaultA = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    vaultB = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    AccessControl = await ethers.getContractFactory("AllowlistAccessControl");
    AccessControlManager = await ethers.getContractFactory("AccessControlManager");

    accessControl1 = (await AccessControl.deploy(governance.address)) as AllowlistAccessControl;
    await accessControl1.deployed();
    accessControl2 = (await AccessControl.deploy(governance.address)) as AllowlistAccessControl;
    await accessControl2.deployed();

    accessControlManager = (await AccessControlManager.deploy(governance.address)) as AccessControlManager;
    await accessControlManager.deployed();
    await accessControlManager.connect(governance).addAccessControlPolicies(vaultA, [accessControl1.address]);
  });

  it("should allow access if no policies are set", async () => {
    expect(await accessControlManager.hasAccess(addr1.address, vaultB)).to.equal(true);
  });

  it("Should return false when access not granted", async function () {
    expect(await accessControlManager.hasAccess(owner.address, vaultA)).to.equal(false);
  });

  it("Should return true when global access is granted", async function () {
    await accessControl1.connect(governance).allowGlobalAccess([addr1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(true);
  });

  it("Should return false when global access is granted and then revoked", async function () {
    await accessControl1.connect(governance).allowGlobalAccess([addr1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(true);

    await accessControl1.connect(governance).removeGlobalAccess([addr1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should return true when local access is granted", async function () {
    await accessControl1.connect(governance).allowVaultAccess([addr1.address], vaultA);
    await accessControl1.connect(governance).allowVaultAccess([addr2.address], vaultB);
    await accessControlManager.connect(governance).addAccessControlPolicies(vaultB, [accessControl1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(true);
    expect(await accessControlManager.hasAccess(addr1.address, vaultB)).to.equal(false);
  });

  it("Should return false when local access is granted and then revoked", async function () {
    await accessControl1.connect(governance).allowVaultAccess([addr1.address], vaultA);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(true);

    await accessControl1.connect(governance).removeVaultAccess([addr1.address], vaultA);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should return the correct value when both local and global access are set", async function () {
    await accessControl1.connect(governance).allowVaultAccess([addr1.address], vaultA);
    await accessControl1.connect(governance).allowGlobalAccess([addr1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(true);

    await accessControl1.connect(governance).removeVaultAccess([addr1.address], vaultA);
    await accessControl1.connect(governance).removeGlobalAccess([addr1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should be able to add an access control policy", async function () {
    expect(await policySize(accessControlManager, vaultA)).to.equal(1);
    await accessControlManager.connect(governance).addAccessControlPolicies(vaultA, [accessControl2.address]);
    expect(await policySize(accessControlManager, vaultA)).to.equal(2);
  });

  it("Should be able to remove an access control policy", async function () {
    expect(await policySize(accessControlManager, vaultA)).to.equal(1);
    await accessControlManager.connect(governance).removeAccessControlPolicies(vaultA, [accessControl1.address]);
    expect(await policySize(accessControlManager, vaultA)).to.equal(0);
  });

  it("Should not add an invalid address", async function () {
    expect(await policySize(accessControlManager, vaultA)).to.equal(1);
    await accessControlManager.connect(governance).addAccessControlPolicies(vaultA, [ethers.constants.AddressZero]);
    expect(await policySize(accessControlManager, vaultA)).to.equal(1);
  });

  it("Should be unchanged when removing an invalid address", async function () {
    expect(await policySize(accessControlManager, vaultA)).to.equal(1);
    await accessControlManager.connect(governance).removeAccessControlPolicies(vaultA, [ethers.constants.AddressZero]);
    expect(await policySize(accessControlManager, vaultA)).to.equal(1);
  });

  it("Should be unchanged when removing address than hasn't been added", async function () {
    expect(await policySize(accessControlManager, vaultA)).to.equal(1);
    await accessControlManager.connect(governance).removeAccessControlPolicies(vaultA, [accessControl2.address]);
    expect(await policySize(accessControlManager, vaultA)).to.equal(1);
  });

  it("Should not add the same policy twice", async function () {
    expect(await policySize(accessControlManager, vaultA)).to.equal(1);
    await accessControlManager.connect(governance).addAccessControlPolicies(vaultA, [accessControl1.address]);
    expect(await policySize(accessControlManager, vaultA)).to.equal(1);
  });

  it("Should be able to add and remove multiple policies", async function () {
    await accessControlManager.connect(governance).removeAccessControlPolicies(vaultA, [accessControl1.address]);
    expect(await policySize(accessControlManager, vaultA)).to.equal(0);

    await accessControlManager.connect(governance).addAccessControlPolicies(vaultA, [accessControl1.address, accessControl2.address]);
    expect(await policySize(accessControlManager, vaultA)).to.equal(2);

    await accessControlManager.connect(governance).removeAccessControlPolicies(vaultA, [accessControl1.address, accessControl2.address]);
    expect(await policySize(accessControlManager, vaultA)).to.equal(0);
  });

  it("Should revert when calling hasAccess on invalid address", async function () {
    expect(accessControlManager.hasAccess(ethers.constants.AddressZero, vaultA)).to.be.revertedWith("invalid user address");
  });

  it("Should revert when calling hasAccess on invalid vault", async function () {
    expect(accessControlManager.hasAccess(addr1.address, ethers.constants.AddressZero)).to.be.revertedWith("invalid vault address");
  });

  describe("addAccessControlPolicies", async () => {
    it("gatekeeper can add policies, and only for the vault it manages", async () => {
      await accessControlManager.connect(governance).setVaultGatekeeper(vaultA, gatekeeper.address);
      expect(await policySize(accessControlManager, vaultA)).to.equal(1);
      await accessControlManager.connect(gatekeeper).addAccessControlPolicies(vaultA, [accessControl2.address]);
      expect(await policySize(accessControlManager, vaultA)).to.equal(2);
      await expect(accessControlManager.connect(gatekeeper).addAccessControlPolicies(vaultB, [accessControl2.address])).to.be.revertedWith(
        "not authorised"
      );
    });

    it("non governance nor gatekeeper users can't add polices", async () => {
      await expect(accessControlManager.connect(addr1).addAccessControlPolicies(vaultA, [accessControl2.address])).to.be.revertedWith(
        "not authorised"
      );
    });
  });

  describe("removeAccessControlPolicies", async () => {
    it("gatekeeper can remove policies, and only for the vault it manages", async () => {
      await accessControlManager.connect(governance).setVaultGatekeeper(vaultA, gatekeeper.address);
      expect(await policySize(accessControlManager, vaultA)).to.equal(1);
      await accessControlManager.connect(gatekeeper).removeAccessControlPolicies(vaultA, [accessControl1.address]);
      expect(await policySize(accessControlManager, vaultA)).to.equal(0);
      await expect(accessControlManager.connect(gatekeeper).removeAccessControlPolicies(vaultB, [accessControl1.address])).to.be.revertedWith(
        "not authorised"
      );
    });

    it("non governance nor gatekeeper users can't remove polices", async () => {
      await expect(accessControlManager.connect(addr1).removeAccessControlPolicies(vaultA, [accessControl1.address])).to.be.revertedWith(
        "not authorised"
      );
    });
  });
});
