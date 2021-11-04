import { expect } from "chai";
import { ethers } from "hardhat";

describe("AccessControlManager", function () {
  let owner: any;
  let addr1: any;
  let vaultA: any;
  let vaultB: any;
  let address0: any;
  let accessControl1: any;
  let accessControl2: any;
  let AccessControl: any;
  let accessControlManager: any;
  let AccessControlManager: any;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    vaultA = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    address0 = "0x0000000000000000000000000000000000000000";
    vaultB = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    AccessControl = await ethers.getContractFactory("AllowlistAccessControl");
    AccessControlManager = await ethers.getContractFactory("AccessControlManagerMock");

    accessControl1 = await AccessControl.deploy();
    await accessControl1.deployed();
    accessControl2 = await AccessControl.deploy();
    await accessControl2.deployed();

    accessControlManager = await AccessControlManager.deploy([accessControl1.address]);
    await accessControlManager.deployed();
  });

  it("Should return false when access not granted", async function () {
    expect(await accessControlManager.hasAccess(owner.address, vaultA)).to.equal(false);
  });

  it("Should return true when global access is granted", async function () {
    await accessControl1.allowGlobalAccess([addr1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(true);
  });

  it("Should return false when global access is granted and then revoked", async function () {
    await accessControl1.allowGlobalAccess([addr1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(true);

    await accessControl1.removeGlobalAccess([addr1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should return true when local access is granted", async function () {
    await accessControl1.allowVaultAccess([addr1.address], vaultA);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(true);
    expect(await accessControlManager.hasAccess(addr1.address, vaultB)).to.equal(false);
  });

  it("Should return false when local access is granted and then revoked", async function () {
    await accessControl1.allowVaultAccess([addr1.address], vaultA);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(true);

    await accessControl1.removeVaultAccess([addr1.address], vaultA);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should return the correct value when both local and global access are set", async function () {
    await accessControl1.allowVaultAccess([addr1.address], vaultA);
    await accessControl1.allowGlobalAccess([addr1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(true);

    await accessControl1.removeVaultAccess([addr1.address], vaultA);
    await accessControl1.removeGlobalAccess([addr1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should be able to add an access control policy", async function () {
    expect(await accessControlManager.getNumberOfAccessControlPolicies()).to.equal(1);
    await accessControlManager.addAccessControlPolicys([accessControl2.address]);
    expect(await accessControlManager.getNumberOfAccessControlPolicies()).to.equal(2);
  });

  it("Should be able to remove an access control policy", async function () {
    expect(await accessControlManager.getNumberOfAccessControlPolicies()).to.equal(1);
    await accessControlManager.removeAccessControlPolicys([accessControl1.address]);
    expect(await accessControlManager.getNumberOfAccessControlPolicies()).to.equal(0);
  });

  it("Should not add an invalid address", async function () {
    expect(await accessControlManager.getNumberOfAccessControlPolicies()).to.equal(1);
    await accessControlManager.addAccessControlPolicys([address0]);
    expect(await accessControlManager.getNumberOfAccessControlPolicies()).to.equal(1);
  });

  it("Should be unchanged when removing an invalid address", async function () {
    expect(await accessControlManager.getNumberOfAccessControlPolicies()).to.equal(1);
    await accessControlManager.removeAccessControlPolicys([address0]);
    expect(await accessControlManager.getNumberOfAccessControlPolicies()).to.equal(1);
  });

  it("Should be unchanged when removing address than hasn't been added", async function () {
    expect(await accessControlManager.getNumberOfAccessControlPolicies()).to.equal(1);
    await accessControlManager.removeAccessControlPolicys([accessControl2.address]);
    expect(await accessControlManager.getNumberOfAccessControlPolicies()).to.equal(1);
  });

  it("Should not add the same policy twice", async function () {
    expect(await accessControlManager.getNumberOfAccessControlPolicies()).to.equal(1);
    await accessControlManager.addAccessControlPolicys([accessControl1.address]);
    expect(await accessControlManager.getNumberOfAccessControlPolicies()).to.equal(1);
  });

  it("Should be able to add and remove multiple policies", async function () {
    await accessControlManager.removeAccessControlPolicys([accessControl1.address]);
    expect(await accessControlManager.getNumberOfAccessControlPolicies()).to.equal(0);

    await accessControlManager.addAccessControlPolicys([accessControl1.address, accessControl2.address]);
    expect(await accessControlManager.getNumberOfAccessControlPolicies()).to.equal(2);

    await accessControlManager.removeAccessControlPolicys([accessControl1.address, accessControl2.address]);
    expect(await accessControlManager.getNumberOfAccessControlPolicies()).to.equal(0);
  });

  it("Should revert when calling hasAccess on invalid address", async function () {
    expect(accessControlManager.hasAccess(address0, vaultA)).to.be.revertedWith("invalid user address");
  });

  it("Should revert when calling hasAccess on invalid vault", async function () {
    expect(accessControlManager.hasAccess(addr1.address, address0)).to.be.revertedWith("invalid vault address");
  });
});
