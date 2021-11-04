import { expect } from "chai";
import { ethers } from "hardhat";

describe("AllowlistAccessControl", function () {
  let owner: any;
  let addr1: any;
  let addressArray: any;
  let address0: any;
  let vaultA: any;
  let vaultB: any;
  let allowlistAccessControl: any;
  let AllowlistAccessControl: any;
  beforeEach(async function () {
    address0 = "0x0000000000000000000000000000000000000000";
    AllowlistAccessControl = await ethers.getContractFactory("AllowlistAccessControl");
    [owner, addr1] = await ethers.getSigners();
    addressArray = [addr1.address];
    vaultA = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    vaultB = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    allowlistAccessControl = await AllowlistAccessControl.deploy();
    await allowlistAccessControl.deployed();
  });

  it("Should return false when access not granted", async function () {
    expect(await allowlistAccessControl.hasAccess(owner.address, vaultA)).to.equal(false);
  });

  it("Should revert when calling hasAccess on invalid address", async function () {
    await expect(allowlistAccessControl.hasAccess(address0, vaultA)).to.be.revertedWith("invalid user address");
  });

  it("Should revert when calling hasAccess on invalid vault", async function () {
    await expect(allowlistAccessControl.hasAccess(addr1.address, address0)).to.be.revertedWith("invalid vault address");
  });

  it("Should return true when global access is granted", async function () {
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(false);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultB)).to.equal(false);
    await allowlistAccessControl.allowGlobalAccess(addressArray);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultB)).to.equal(true);
  });

  it("Should return false when global access is granted and then revoked", async function () {
    await allowlistAccessControl.allowGlobalAccess(addressArray);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);

    await allowlistAccessControl.removeGlobalAccess(addressArray);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should return true when vault access is granted", async function () {
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(false);
    await allowlistAccessControl.allowVaultAccess(addressArray, vaultA);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);
  });

  it("Should return false when vault access is granted and then revoked", async function () {
    await allowlistAccessControl.allowVaultAccess(addressArray, vaultA);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);

    await allowlistAccessControl.removeVaultAccess(addressArray, vaultA);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should return the correct value when both vault and global access are set", async function () {
    await allowlistAccessControl.allowVaultAccess(addressArray, vaultA);
    await allowlistAccessControl.allowGlobalAccess(addressArray);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);

    await allowlistAccessControl.removeVaultAccess(addressArray, vaultA);
    await allowlistAccessControl.removeGlobalAccess(addressArray);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should not change vault access when adding the same adress twice", async function () {
    await allowlistAccessControl.allowVaultAccess(addressArray, vaultA);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);
    await allowlistAccessControl.allowVaultAccess(addressArray, vaultA);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);
  });

  it("Should not change global access when adding the same adress twice", async function () {
    await allowlistAccessControl.allowGlobalAccess(addressArray);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);
    await allowlistAccessControl.allowGlobalAccess(addressArray);
    expect(await allowlistAccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);
  });

  it("Should revert when calling allowGlobalAccess with invalid address", async function () {
    await expect(allowlistAccessControl.allowGlobalAccess([address0])).to.be.revertedWith("invalid address");
  });

  it("Should revert when calling allowVaultAccess with user address", async function () {
    await expect(allowlistAccessControl.allowVaultAccess([address0], vaultA)).to.be.revertedWith("invalid user address");
  });

  it("Should revert when calling allowVaultAccess with invalid vault address", async function () {
    await expect(allowlistAccessControl.allowVaultAccess([addr1.address], address0)).to.be.revertedWith("invalid vault address");
  });
});
