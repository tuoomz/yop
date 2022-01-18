import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ContractFactory } from "ethers";
import { ethers, waffle } from "hardhat";
import { AllowlistAccessControl } from "../../../types";
import { AccessControlManager } from "../../../types/AccessControlManager";
import IGatekeeperableABI from "../../../abi/contracts/interfaces/roles/IGatekeeperable.sol/IGatekeeperable.json";
import { MockContract } from "ethereum-waffle";

const { deployMockContract } = waffle;

async function policySize(accessControlManager: AccessControlManager) {
  return (await accessControlManager.getAccessControlPolicies()).length;
}

describe("AccessControlManager", function () {
  let owner: SignerWithAddress;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let vaultA: MockContract;
  let vaultB: MockContract;
  let accessControl1: AllowlistAccessControl;
  let accessControl2: AllowlistAccessControl;
  let AccessControl: ContractFactory;
  let accessControlManager: AccessControlManager;
  let AccessControlManager: ContractFactory;

  beforeEach(async function () {
    [owner, governance, gatekeeper, addr1, addr2] = await ethers.getSigners();
    vaultA = await deployMockContract(owner, IGatekeeperableABI);
    vaultB = await deployMockContract(owner, IGatekeeperableABI);
    AccessControl = await ethers.getContractFactory("AllowlistAccessControl");
    AccessControlManager = await ethers.getContractFactory("AccessControlManager");

    accessControl1 = (await AccessControl.deploy(governance.address)) as AllowlistAccessControl;
    await accessControl1.deployed();
    accessControl2 = (await AccessControl.deploy(governance.address)) as AllowlistAccessControl;
    await accessControl2.deployed();

    accessControlManager = (await AccessControlManager.deploy(governance.address, [])) as AccessControlManager;
    await accessControlManager.deployed();
    await vaultA.mock.gatekeeper.returns(gatekeeper.address);
    await vaultB.mock.gatekeeper.returns(gatekeeper.address);
  });

  it("should not allow access if no policies are set", async () => {
    expect(await accessControlManager.hasAccess(addr1.address, vaultB.address)).to.equal(false);
  });

  it("Should return false when access not granted", async function () {
    await accessControlManager.connect(governance).addAccessControlPolicies([accessControl1.address, accessControl2.address]);
    expect(await accessControlManager.hasAccess(owner.address, vaultA.address)).to.equal(false);
  });

  it("Should return true when global access is granted", async function () {
    await accessControl1.connect(governance).allowGlobalAccess([addr1.address]);
    await accessControlManager.connect(governance).addAccessControlPolicies([accessControl1.address, accessControl2.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA.address)).to.equal(true);
  });

  it("Should return false when global access is granted and then revoked", async function () {
    await accessControl1.connect(governance).allowGlobalAccess([addr1.address]);
    await accessControlManager.connect(governance).addAccessControlPolicies([accessControl1.address, accessControl2.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA.address)).to.equal(true);

    await accessControl1.connect(governance).removeGlobalAccess([addr1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA.address)).to.equal(false);
  });

  it("Should return true when local access is granted", async function () {
    await accessControlManager.connect(governance).addAccessControlPolicies([accessControl1.address, accessControl2.address]);
    await accessControl1.connect(governance).allowVaultAccess([addr1.address], vaultA.address);
    await accessControl1.connect(governance).allowVaultAccess([addr2.address], vaultB.address);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA.address)).to.equal(true);
    expect(await accessControlManager.hasAccess(addr1.address, vaultB.address)).to.equal(false);
  });

  it("Should return false when local access is granted and then revoked", async function () {
    await accessControlManager.connect(governance).addAccessControlPolicies([accessControl1.address, accessControl2.address]);
    await accessControl1.connect(governance).allowVaultAccess([addr1.address], vaultA.address);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA.address)).to.equal(true);

    await accessControl1.connect(governance).removeVaultAccess([addr1.address], vaultA.address);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA.address)).to.equal(false);
  });

  it("Should return the correct value when both local and global access are set", async function () {
    await accessControlManager.connect(governance).addAccessControlPolicies([accessControl1.address, accessControl2.address]);
    await accessControl1.connect(governance).allowVaultAccess([addr1.address], vaultA.address);
    await accessControl1.connect(governance).allowGlobalAccess([addr1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA.address)).to.equal(true);

    await accessControl1.connect(governance).removeVaultAccess([addr1.address], vaultA.address);
    await accessControl1.connect(governance).removeGlobalAccess([addr1.address]);
    expect(await accessControlManager.hasAccess(addr1.address, vaultA.address)).to.equal(false);
  });

  it("Should be able to add an access control policy", async function () {
    await accessControlManager.connect(governance).addAccessControlPolicies([accessControl1.address]);
    expect(await policySize(accessControlManager)).to.equal(1);
    await accessControlManager.connect(governance).addAccessControlPolicies([accessControl2.address]);
    expect(await policySize(accessControlManager)).to.equal(2);
  });

  it("Should be able to remove an access control policy", async function () {
    await accessControlManager.connect(governance).addAccessControlPolicies([accessControl1.address]);
    expect(await policySize(accessControlManager)).to.equal(1);
    await accessControlManager.connect(governance).removeAccessControlPolicies([accessControl1.address]);
    expect(await policySize(accessControlManager)).to.equal(0);
  });

  it("Should not add an invalid address", async function () {
    await accessControlManager.connect(governance).addAccessControlPolicies([accessControl1.address]);
    expect(await policySize(accessControlManager)).to.equal(1);
    await accessControlManager.connect(governance).addAccessControlPolicies([ethers.constants.AddressZero]);
    expect(await policySize(accessControlManager)).to.equal(1);
  });

  it("Should be unchanged when removing an invalid address", async function () {
    await accessControlManager.connect(governance).addAccessControlPolicies([accessControl1.address]);
    expect(await policySize(accessControlManager)).to.equal(1);
    await accessControlManager.connect(governance).removeAccessControlPolicies([ethers.constants.AddressZero]);
    expect(await policySize(accessControlManager)).to.equal(1);
  });

  it("Should be unchanged when removing address than hasn't been added", async function () {
    await accessControlManager.connect(governance).addAccessControlPolicies([accessControl1.address]);
    expect(await policySize(accessControlManager)).to.equal(1);
    await accessControlManager.connect(governance).removeAccessControlPolicies([accessControl2.address]);
    expect(await policySize(accessControlManager)).to.equal(1);
  });

  it("Should not add the same policy twice", async function () {
    await accessControlManager.connect(governance).addAccessControlPolicies([accessControl1.address]);
    expect(await policySize(accessControlManager)).to.equal(1);
    await accessControlManager.connect(governance).addAccessControlPolicies([accessControl1.address]);
    expect(await policySize(accessControlManager)).to.equal(1);
  });

  it("Should be able to add and remove multiple policies", async function () {
    await accessControlManager.connect(governance).addAccessControlPolicies([accessControl1.address]);
    await accessControlManager.connect(governance).removeAccessControlPolicies([accessControl1.address]);
    expect(await policySize(accessControlManager)).to.equal(0);

    await accessControlManager.connect(governance).addAccessControlPolicies([accessControl1.address, accessControl2.address]);
    expect(await policySize(accessControlManager)).to.equal(2);

    await accessControlManager.connect(governance).removeAccessControlPolicies([accessControl1.address, accessControl2.address]);
    expect(await policySize(accessControlManager)).to.equal(0);
  });

  it("Should revert when calling hasAccess on invalid address", async function () {
    expect(accessControlManager.hasAccess(ethers.constants.AddressZero, vaultA.address)).to.be.revertedWith("invalid user address");
  });

  it("Should revert when calling hasAccess on invalid vault", async function () {
    expect(accessControlManager.hasAccess(addr1.address, ethers.constants.AddressZero)).to.be.revertedWith("invalid vault address");
  });

  describe("addAccessControlPolicies", async () => {
    it("gatekeeper can add policies", async () => {
      await accessControlManager.connect(governance).addAccessControlPolicies([accessControl1.address]);
      expect(await policySize(accessControlManager)).to.equal(1);
      await accessControlManager.connect(governance).addAccessControlPolicies([accessControl2.address]);
      expect(await policySize(accessControlManager)).to.equal(2);
    });

    it("non governance users can't add polices", async () => {
      await expect(accessControlManager.connect(gatekeeper).addAccessControlPolicies([accessControl2.address])).to.be.revertedWith(
        "governance only"
      );
    });
  });

  describe("removeAccessControlPolicies", async () => {
    it("gatekeeper can remove policies", async () => {
      await accessControlManager.connect(governance).addAccessControlPolicies([accessControl1.address]);
      expect(await policySize(accessControlManager)).to.equal(1);
      await accessControlManager.connect(governance).removeAccessControlPolicies([accessControl1.address]);
      expect(await policySize(accessControlManager)).to.equal(0);
    });

    it("non governance nor gatekeeper users can't remove polices", async () => {
      await accessControlManager.connect(governance).addAccessControlPolicies([accessControl1.address]);
      await expect(accessControlManager.connect(gatekeeper).removeAccessControlPolicies([accessControl1.address])).to.be.revertedWith(
        "governance only"
      );
    });
  });
});
