import { expect } from "chai";
import { ethers } from "hardhat";

describe("AccessControlManager", function () {
  let owner: any;
  let addr1: any;
  let vaultA: any;
  let vaultB: any;
  let accessControl: any;
  let AccessControl: any;
  let accessControlManager: any;
  let AccessControlManager: any;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    vaultA = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    vaultB = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    AccessControl = await ethers.getContractFactory("AllowlistAccessControl");
    AccessControlManager = await ethers.getContractFactory("AccessControlManagerMock");

    accessControl = await AccessControl.deploy();
    await accessControl.deployed();
    accessControlManager = await AccessControlManager.deploy(accessControl.address);
    await accessControlManager.deployed();
  });

  it("Should return false when access not granted", async function () {
    expect(await accessControlManager.hasAccess(owner.address, vaultA)).to.equal(false);
  });

  it("Should return true when global access is granted", async function () {
    await accessControl.allowGlobalAccess([addr1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(true);
  });

  it("Should return false when global access is granted and then revoked", async function () {
    await accessControl.allowGlobalAccess([addr1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(true);

    await accessControl.removeGlobalAccess([addr1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should return true when local access is granted", async function () {
    await accessControl.allowVaultAccess([addr1.address], vaultA);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(true);
    expect(await accessControlManager.hasAccess(addr1.address, vaultB)).to.equal(false);
  });

  it("Should return false when local access is granted and then revoked", async function () {
    await accessControl.allowVaultAccess([addr1.address], vaultA);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(true);

    await accessControl.removeVaultAccess([addr1.address], vaultA);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should return the correct value when both local and global access are set", async function () {
    await accessControl.allowVaultAccess([addr1.address], vaultA);
    await accessControl.allowGlobalAccess([addr1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(true);

    await accessControl.removeVaultAccess([addr1.address], vaultA);
    await accessControl.removeGlobalAccess([addr1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA)).to.equal(false);
  });
});
