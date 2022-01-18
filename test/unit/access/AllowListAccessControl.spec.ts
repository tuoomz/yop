import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { MockContract } from "ethereum-waffle";
import { ContractFactory } from "ethers";
import { ethers, waffle } from "hardhat";
import { AllowlistAccessControl } from "../../../types";
import IGatekeeperableABI from "../../../abi/contracts/interfaces/roles/IGatekeeperable.sol/IGatekeeperable.json";

const { deployMockContract } = waffle;

describe("AllowlistAccessControl", function () {
  let deployer: SignerWithAddress;
  let governor: SignerWithAddress;
  let addr1: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let gatekeeper2: SignerWithAddress;
  let addressArray: Array<string>;
  let vaultA: MockContract;
  let vaultB: MockContract;
  let allowlistAccessControl: AllowlistAccessControl;
  let AllowlistAccessControl: ContractFactory;
  const address0 = ethers.constants.AddressZero;
  beforeEach(async function () {
    AllowlistAccessControl = await ethers.getContractFactory("AllowlistAccessControl");
    [deployer, governor, gatekeeper, gatekeeper2, addr1] = await ethers.getSigners();
    addressArray = [addr1.address];
    vaultA = await deployMockContract(deployer, IGatekeeperableABI);
    vaultB = await deployMockContract(deployer, IGatekeeperableABI);
    allowlistAccessControl = (await AllowlistAccessControl.deploy(governor.address)) as AllowlistAccessControl;
    await allowlistAccessControl.connect(governor).deployed();
    await vaultA.mock.gatekeeper.returns(gatekeeper.address);
    await vaultB.mock.gatekeeper.returns(gatekeeper2.address);
  });

  it("Should return false when access not granted", async function () {
    expect(await allowlistAccessControl.connect(governor).hasAccess(governor.address, vaultA.address)).to.equal(false);
  });

  it("Should revert when calling hasAccess on invalid address", async function () {
    await expect(allowlistAccessControl.connect(governor).hasAccess(address0, vaultA.address)).to.be.revertedWith("invalid user address");
  });

  it("Should revert when calling hasAccess on invalid vault", async function () {
    await expect(allowlistAccessControl.connect(governor).hasAccess(addr1.address, address0)).to.be.revertedWith("invalid vault address");
  });

  it("Should return true when global access is granted", async function () {
    expect(await allowlistAccessControl.connect(governor).hasAccess(addr1.address, vaultA.address)).to.equal(false);
    expect(await allowlistAccessControl.connect(governor).hasAccess(addr1.address, vaultB.address)).to.equal(false);
    await allowlistAccessControl.connect(governor).allowGlobalAccess(addressArray);
    expect(await allowlistAccessControl.connect(governor).hasAccess(addr1.address, vaultA.address)).to.equal(true);
    expect(await allowlistAccessControl.connect(governor).hasAccess(addr1.address, vaultB.address)).to.equal(true);
  });

  it("Should return false when global access is granted and then revoked", async function () {
    await allowlistAccessControl.connect(governor).allowGlobalAccess(addressArray);
    expect(await allowlistAccessControl.connect(governor).hasAccess(addr1.address, vaultA.address)).to.equal(true);

    await allowlistAccessControl.connect(governor).removeGlobalAccess(addressArray);
    expect(await allowlistAccessControl.connect(governor).hasAccess(addr1.address, vaultA.address)).to.equal(false);
  });

  it("Should return true when vault access is granted", async function () {
    expect(await allowlistAccessControl.connect(governor).hasAccess(addr1.address, vaultA.address)).to.equal(false);
    await allowlistAccessControl.connect(governor).allowVaultAccess(addressArray, vaultA.address);
    expect(await allowlistAccessControl.connect(governor).hasAccess(addr1.address, vaultA.address)).to.equal(true);
  });

  it("Should return false when vault access is granted and then revoked", async function () {
    await allowlistAccessControl.connect(governor).allowVaultAccess(addressArray, vaultA.address);
    expect(await allowlistAccessControl.connect(governor).hasAccess(addr1.address, vaultA.address)).to.equal(true);

    await allowlistAccessControl.connect(governor).removeVaultAccess(addressArray, vaultA.address);
    expect(await allowlistAccessControl.connect(governor).hasAccess(addr1.address, vaultA.address)).to.equal(false);
  });

  it("Should return the correct value when both vault and global access are set", async function () {
    await allowlistAccessControl.connect(governor).allowVaultAccess(addressArray, vaultA.address);
    await allowlistAccessControl.connect(governor).allowGlobalAccess(addressArray);
    expect(await allowlistAccessControl.connect(governor).hasAccess(addr1.address, vaultA.address)).to.equal(true);

    await allowlistAccessControl.connect(governor).removeVaultAccess(addressArray, vaultA.address);
    await allowlistAccessControl.connect(governor).removeGlobalAccess(addressArray);
    expect(await allowlistAccessControl.connect(governor).hasAccess(addr1.address, vaultA.address)).to.equal(false);
  });

  it("Should not change vault access when adding the same adress twice", async function () {
    await allowlistAccessControl.connect(governor).allowVaultAccess(addressArray, vaultA.address);
    expect(await allowlistAccessControl.connect(governor).hasAccess(addr1.address, vaultA.address)).to.equal(true);
    await allowlistAccessControl.connect(governor).allowVaultAccess(addressArray, vaultA.address);
    expect(await allowlistAccessControl.connect(governor).hasAccess(addr1.address, vaultA.address)).to.equal(true);
  });

  it("Should not change global access when adding the same adress twice", async function () {
    await allowlistAccessControl.connect(governor).allowGlobalAccess(addressArray);
    expect(await allowlistAccessControl.connect(governor).hasAccess(addr1.address, vaultA.address)).to.equal(true);
    await allowlistAccessControl.connect(governor).allowGlobalAccess(addressArray);
    expect(await allowlistAccessControl.connect(governor).hasAccess(addr1.address, vaultA.address)).to.equal(true);
  });

  it("Should revert when calling allowGlobalAccess with invalid address", async function () {
    await expect(allowlistAccessControl.connect(governor).allowGlobalAccess([address0])).to.be.revertedWith("invalid address");
  });

  it("Should revert when calling allowVaultAccess with user address", async function () {
    await expect(allowlistAccessControl.connect(governor).allowVaultAccess([address0], vaultA.address)).to.be.revertedWith(
      "invalid user address"
    );
  });

  it("Should revert when calling allowVaultAccess with invalid vault address", async function () {
    await expect(allowlistAccessControl.connect(governor).allowVaultAccess([addr1.address], address0)).to.be.revertedWith("!address");
  });

  it("only gatekeeper of a vault can update allowlist for the vault", async () => {
    expect(allowlistAccessControl.connect(gatekeeper).allowVaultAccess([addr1.address], vaultB.address)).to.be.revertedWith("not authorised");
    expect(await allowlistAccessControl.connect(gatekeeper).allowVaultAccess([addr1.address], vaultA.address))
      .to.emit(allowlistAccessControl, "VaultAccessGranted")
      .withArgs(addr1.address, vaultA.address);
    expect(allowlistAccessControl.connect(gatekeeper2).allowVaultAccess([addr1.address], vaultA.address)).to.be.revertedWith("not authorised");
    expect(await allowlistAccessControl.connect(gatekeeper2).allowVaultAccess([addr1.address], vaultB.address))
      .to.emit(allowlistAccessControl, "VaultAccessGranted")
      .withArgs(addr1.address, vaultB.address);
    expect(allowlistAccessControl.connect(gatekeeper).removeVaultAccess([addr1.address], vaultB.address)).to.be.revertedWith("not authorised");
    expect(await allowlistAccessControl.connect(gatekeeper).removeVaultAccess([addr1.address], vaultA.address))
      .to.emit(allowlistAccessControl, "VaultAccessRemoved")
      .withArgs(addr1.address, vaultA.address);
    expect(allowlistAccessControl.connect(gatekeeper2).removeVaultAccess([addr1.address], vaultA.address)).to.be.revertedWith("not authorised");
    expect(await allowlistAccessControl.connect(gatekeeper2).removeVaultAccess([addr1.address], vaultB.address))
      .to.emit(allowlistAccessControl, "VaultAccessRemoved")
      .withArgs(addr1.address, vaultB.address);
  });
});
