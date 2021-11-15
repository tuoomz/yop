import { ContractFactory } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
// eslint-disable-next-line node/no-missing-import
import { ERC1155AccessControl, YopERC1155Mock } from "../../../types";

describe("ERC1155AccessControl", function () {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let gatekeeper1: SignerWithAddress;
  let gatekeeper2: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;
  const address0 = ethers.constants.AddressZero;
  let ERC1155AccessControlFactory: ContractFactory;
  let erc1155AccessControl: ERC1155AccessControl;
  const vaultA = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const vaultB = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
  const numberOfTokens = 5;
  const nftId1 = 1;
  const nftId2 = 2;
  let nft1: YopERC1155Mock;

  beforeEach(async function () {
    [deployer, owner, gatekeeper1, gatekeeper2, addr1, addr2] = await ethers.getSigners();
    const ERC1155 = await ethers.getContractFactory("YopERC1155Mock");
    ERC1155AccessControlFactory = await ethers.getContractFactory("ERC1155AccessControl");
    nft1 = (await ERC1155.deploy(numberOfTokens)) as YopERC1155Mock;
    erc1155AccessControl = (await ERC1155AccessControlFactory.deploy(nft1.address, owner.address)) as ERC1155AccessControl;
  });

  it("Should return false when ERC1155 not held by address", async function () {
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should return true when mapping is set and address has correct ERC1155", async function () {
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA)).to.equal(false);
    await nft1.connect(deployer).safeTransferFrom(deployer.address, addr1.address, nftId1, 1, []);
    await erc1155AccessControl.connect(owner).addVaultToNftMapping([vaultA], [nftId1]);
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultB)).to.equal(false);
  });

  it("Should return false when ERC1155 is added then removed", async function () {
    await nft1.connect(deployer).safeTransferFrom(deployer.address, addr1.address, nftId1, 1, []);
    await erc1155AccessControl.connect(owner).addVaultToNftMapping([vaultA], [nftId1]);
    /// connect to address to addr1 to allow you to transfer the token again
    await nft1.connect(addr1).safeTransferFrom(addr1.address, addr2.address, nftId1, 1, []);
    expect(await erc1155AccessControl.hasAccess(addr2.address, vaultA)).to.equal(true);
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should return false when vault mapping is removed", async function () {
    await nft1.connect(deployer).safeTransferFrom(deployer.address, addr1.address, nftId1, 1, []);
    await erc1155AccessControl.connect(owner).addVaultToNftMapping([vaultA], [nftId1]);
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);
    await erc1155AccessControl.connect(owner).removeVaultToNftMapping([vaultA], [nftId1]);
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA)).to.equal(false);
  });

  it("Should revert when calling calling with 0 address", async function () {
    expect(erc1155AccessControl.hasAccess(address0, vaultA)).to.be.revertedWith("invalid user address");
    expect(erc1155AccessControl.hasAccess(addr1.address, address0)).to.be.revertedWith("invalid vault address");
    expect(erc1155AccessControl.connect(owner).addVaultToNftMapping([address0], [1])).to.be.revertedWith("invalid vault address");
    expect(erc1155AccessControl.connect(owner).removeVaultToNftMapping([address0], [1])).to.be.revertedWith("invalid vault address");
    expect(ERC1155AccessControlFactory.deploy(address0, owner.address)).to.be.revertedWith("invalid nft address");
  });

  it("Should revert when adding mappings with differnt length inputs", async function () {
    expect(erc1155AccessControl.connect(owner).addVaultToNftMapping([address0, address0], [1, 2, 3])).to.be.revertedWith("invalid input");
    expect(erc1155AccessControl.connect(owner).removeVaultToNftMapping([addr1.address, addr1.address], [1])).to.be.revertedWith("invalid input");
    expect(ERC1155AccessControlFactory.deploy(address0, owner.address)).to.be.revertedWith("invalid nft address");
  });

  it("Should revert when being called by a non governer or gatekeeper", async function () {
    expect(erc1155AccessControl.connect(addr1).addVaultToNftMapping([addr1.address], [1])).to.be.revertedWith("not authorised");
  });

  it("Should be able to allow multiple nft ids to have access to vaults", async function () {
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA)).to.equal(false);
    expect(await erc1155AccessControl.hasAccess(addr2.address, vaultA)).to.equal(false);
    await erc1155AccessControl.connect(owner).addVaultToNftMapping([vaultA, vaultA], [nftId1, nftId2]);
    await nft1.connect(deployer).safeTransferFrom(deployer.address, addr1.address, nftId1, 1, []);
    await nft1.connect(deployer).safeTransferFrom(deployer.address, addr2.address, nftId2, 1, []);
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA)).to.equal(true);
    expect(await erc1155AccessControl.hasAccess(addr2.address, vaultA)).to.equal(true);
    await erc1155AccessControl.connect(owner).removeVaultToNftMapping([vaultA], [nftId1]);
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA)).to.equal(false);
    expect(await erc1155AccessControl.hasAccess(addr2.address, vaultA)).to.equal(true);
    await erc1155AccessControl.connect(owner).removeVaultToNftMapping([vaultA], [nftId2]);
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA)).to.equal(false);
    expect(await erc1155AccessControl.hasAccess(addr2.address, vaultA)).to.equal(false);
  });

  it("only the gatekeeper of a vault can update config for the vault", async () => {
    await erc1155AccessControl.connect(owner).setVaultGatekeeper(vaultA, gatekeeper1.address);
    await erc1155AccessControl.connect(owner).setVaultGatekeeper(vaultB, gatekeeper2.address);

    expect(erc1155AccessControl.connect(gatekeeper1).addVaultToNftMapping([vaultB], [nftId1])).to.be.revertedWith("not authorised");
    expect(await erc1155AccessControl.connect(gatekeeper1).addVaultToNftMapping([vaultA], [nftId1]))
      .to.emit(erc1155AccessControl, "VaultAccessGranted")
      .withArgs(vaultA, nftId1);

    expect(erc1155AccessControl.connect(gatekeeper2).addVaultToNftMapping([vaultA], [nftId2])).to.be.revertedWith("not authorised");
    expect(await erc1155AccessControl.connect(gatekeeper2).addVaultToNftMapping([vaultB], [nftId2]))
      .to.emit(erc1155AccessControl, "VaultAccessGranted")
      .withArgs(vaultB, nftId2);

    expect(erc1155AccessControl.connect(gatekeeper1).removeVaultToNftMapping([vaultB], [nftId1])).to.be.revertedWith("not authorised");
    expect(await erc1155AccessControl.connect(gatekeeper1).removeVaultToNftMapping([vaultA], [nftId1]))
      .to.emit(erc1155AccessControl, "VaultAccessRemoved")
      .withArgs(vaultA, nftId1);

    expect(erc1155AccessControl.connect(gatekeeper2).removeVaultToNftMapping([vaultA], [nftId2])).to.be.revertedWith("not authorised");
    expect(await erc1155AccessControl.connect(gatekeeper2).removeVaultToNftMapping([vaultB], [nftId2]))
      .to.emit(erc1155AccessControl, "VaultAccessRemoved")
      .withArgs(vaultB, nftId2);
  });
});
