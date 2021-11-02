import { expect } from "chai";
import { ethers } from "hardhat";

describe("AllowlistAccessControl", function () {
  let owner: any;
  let addr1: any;
  let addressArray: any;
  let vaultA: any;
  let vaultB: any;
  let allowlistAccessControlMock: any;
  let AllowlistAccessControlMock: any;

  beforeEach(async function () {
    AllowlistAccessControlMock = await ethers.getContractFactory("AllowlistAccessControl");
    [owner, addr1] = await ethers.getSigners();
    addressArray = [addr1.address];
    vaultA = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    vaultB = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    allowlistAccessControlMock = await AllowlistAccessControlMock.deploy();
    await allowlistAccessControlMock.deployed();
  });

  it("Should return false when access not granted", async function () {
    expect(await allowlistAccessControlMock.hasAccess(owner.address, vaultA)).to.equal(false);
  });

  it("Should return true when global access is granted", async function () {
    await allowlistAccessControlMock.allowGlobalAccess(addressArray);
    expect(await allowlistAccessControlMock.hasAccess(addr1.address, vaultA)).to.equal(true);
  });

  it("Should return false when global access is granted and then revoked", async function () {
    await allowlistAccessControlMock.allowGlobalAccess(addressArray);
    expect(await allowlistAccessControlMock.hasAccess(addr1.address, vaultA)).to.equal(true);

    await allowlistAccessControlMock.removeGlobalAccess(addressArray);
    expect(await allowlistAccessControlMock.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should return true when vault access is granted", async function () {
    await allowlistAccessControlMock.allowVaultAccess(addressArray, vaultA);
    expect(await allowlistAccessControlMock.hasAccess(addr1.address, vaultA)).to.equal(true);
    expect(await allowlistAccessControlMock.hasAccess(addr1.address, vaultB)).to.equal(false);
  });

  it("Should return false when vault access is granted and then revoked", async function () {
    await allowlistAccessControlMock.allowVaultAccess(addressArray, vaultA);
    expect(await allowlistAccessControlMock.hasAccess(addr1.address, vaultA)).to.equal(true);

    await allowlistAccessControlMock.removeVaultAccess(addressArray, vaultA);
    expect(await allowlistAccessControlMock.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should return the correct value when both vault and global access are set", async function () {
    await allowlistAccessControlMock.allowVaultAccess(addressArray, vaultA);
    await allowlistAccessControlMock.allowGlobalAccess(addressArray);
    expect(await allowlistAccessControlMock.hasAccess(addr1.address, vaultA)).to.equal(true);

    await allowlistAccessControlMock.removeVaultAccess(addressArray, vaultA);
    await allowlistAccessControlMock.removeGlobalAccess(addressArray);
    expect(await allowlistAccessControlMock.hasAccess(addr1.address, vaultA)).to.equal(false);
  });
});
