import { ContractFactory } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockContract } from "ethereum-waffle";
import { expect } from "chai";
import { ethers, waffle } from "hardhat";
// eslint-disable-next-line node/no-missing-import
import { ERC1155AccessControl, YopERC1155Mock } from "../../../types";
import IGatekeeperableABI from "../../../abi/contracts/interfaces/roles/IGatekeeperable.sol/IGatekeeperable.json";
import { BigNumber } from "ethers";

const { deployMockContract } = waffle;
const ADDRESS_ONE = "0x0000000000000000000000000000000000000001";

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
  let vaultA: MockContract;
  let vaultB: MockContract;
  const numberOfTokens = 5;
  const nftId1 = 1;
  const nftId2 = 2;
  let nft1: YopERC1155Mock;

  beforeEach(async function () {
    [deployer, owner, gatekeeper1, gatekeeper2, addr1, addr2] = await ethers.getSigners();
    const ERC1155 = await ethers.getContractFactory("YopERC1155Mock");
    ERC1155AccessControlFactory = await ethers.getContractFactory("ERC1155AccessControl");
    nft1 = (await ERC1155.deploy(numberOfTokens)) as YopERC1155Mock;
    erc1155AccessControl = (await ERC1155AccessControlFactory.deploy(owner.address)) as ERC1155AccessControl;
    vaultA = await deployMockContract(deployer, IGatekeeperableABI);
    vaultB = await deployMockContract(deployer, IGatekeeperableABI);
    await vaultA.mock.gatekeeper.returns(gatekeeper1.address);
    await vaultB.mock.gatekeeper.returns(gatekeeper2.address);
  });

  it("Should return false when ERC1155 not held by address", async function () {
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA.address)).to.equal(false);
  });

  it("Should return true when mapping is set and address has correct ERC1155", async function () {
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA.address)).to.equal(false);
    await nft1.connect(deployer).safeTransferFrom(deployer.address, addr1.address, nftId1, 1, []);
    await erc1155AccessControl.connect(owner).addNftAccessToVaults([vaultA.address], [nft1.address], [[nftId1]]);
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA.address)).to.equal(true);
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultB.address)).to.equal(false);
  });

  it("Should return false when ERC1155 is added then removed", async function () {
    await nft1.connect(deployer).safeTransferFrom(deployer.address, addr1.address, nftId1, 1, []);
    await erc1155AccessControl.connect(owner).addNftAccessToVaults([vaultA.address], [nft1.address], [[nftId1]]);
    /// connect to address to addr1 to allow you to transfer the token again
    await nft1.connect(addr1).safeTransferFrom(addr1.address, addr2.address, nftId1, 1, []);
    expect(await erc1155AccessControl.hasAccess(addr2.address, vaultA.address)).to.equal(true);
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA.address)).to.equal(false);
  });

  it("Should return false when vault mapping is removed", async function () {
    await nft1.connect(deployer).safeTransferFrom(deployer.address, addr1.address, nftId1, 1, []);
    await erc1155AccessControl.connect(owner).addNftAccessToVaults([vaultA.address], [nft1.address], [[nftId1]]);
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA.address)).to.equal(true);
    await erc1155AccessControl.connect(owner).removeNftAccessToVaults([vaultA.address], [nft1.address], [[nftId1]]);
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA.address)).to.equal(false);
  });

  it("Should revert when calling calling with 0 address", async function () {
    await expect(erc1155AccessControl.hasAccess(address0, vaultA.address)).to.be.revertedWith("!user");
    await expect(erc1155AccessControl.hasAccess(addr1.address, address0)).to.be.revertedWith("!vault");
    await expect(erc1155AccessControl.connect(owner).addNftAccessToVaults([address0], [nft1.address], [[1]])).to.be.revertedWith("!address");
    await expect(erc1155AccessControl.connect(owner).removeNftAccessToVaults([address0], [nft1.address], [[1]])).to.be.revertedWith("!address");
  });

  it("Should revert when adding mappings with differnt length inputs", async function () {
    await expect(erc1155AccessControl.connect(owner).addNftAccessToVaults([], [], [])).to.be.revertedWith("!vaults");
    await expect(
      erc1155AccessControl.connect(owner).addNftAccessToVaults([address0], [nft1.address, nft1.address], [[1], [2], [3]])
    ).to.be.revertedWith("!input");
    await expect(
      erc1155AccessControl.connect(owner).addNftAccessToVaults([address0, address0], [nft1.address, nft1.address], [[1], [2], [3]])
    ).to.be.revertedWith("!input");
    await expect(
      erc1155AccessControl.connect(owner).removeNftAccessToVaults([addr1.address, addr1.address], [nft1.address, nft1.address], [[1]])
    ).to.be.revertedWith("!input");
    await expect(erc1155AccessControl.connect(owner).removeNftAccessToVaults([], [], [])).to.be.revertedWith("!vaults");
    await expect(
      erc1155AccessControl.connect(owner).removeNftAccessToVaults([addr1.address, addr1.address], [nft1.address], [[1]])
    ).to.be.revertedWith("!input");
  });

  it("Should revert when being called by a non governer or gatekeeper", async function () {
    await expect(erc1155AccessControl.connect(addr1).addNftAccessToVaults([vaultA.address], [nft1.address], [[1]])).to.be.revertedWith(
      "not authorised"
    );
  });

  it("Should be able to allow multiple nft ids to have access to vaults", async function () {
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA.address)).to.equal(false);
    expect(await erc1155AccessControl.hasAccess(addr2.address, vaultA.address)).to.equal(false);
    await erc1155AccessControl.connect(owner).addNftAccessToVaults([vaultA.address], [nft1.address], [[nftId1, nftId2]]);
    await nft1.connect(deployer).safeTransferFrom(deployer.address, addr1.address, nftId1, 1, []);
    await nft1.connect(deployer).safeTransferFrom(deployer.address, addr2.address, nftId2, 1, []);
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA.address)).to.equal(true);
    expect(await erc1155AccessControl.hasAccess(addr2.address, vaultA.address)).to.equal(true);
    await erc1155AccessControl.connect(owner).removeNftAccessToVaults([vaultA.address], [nft1.address], [[nftId1]]);
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA.address)).to.equal(false);
    expect(await erc1155AccessControl.hasAccess(addr2.address, vaultA.address)).to.equal(true);
    await erc1155AccessControl.connect(owner).removeNftAccessToVaults([vaultA.address], [nft1.address], [[nftId2]]);
    expect(await erc1155AccessControl.hasAccess(addr1.address, vaultA.address)).to.equal(false);
    expect(await erc1155AccessControl.hasAccess(addr2.address, vaultA.address)).to.equal(false);
  });

  it("only the gatekeeper of a vault can update config for the vault", async () => {
    await vaultA.mock.gatekeeper.returns(gatekeeper1.address);
    await vaultB.mock.gatekeeper.returns(gatekeeper2.address);

    await expect(
      erc1155AccessControl.connect(gatekeeper1).addNftAccessToVaults([vaultB.address], [nft1.address], [[nftId1]])
    ).to.be.revertedWith("not authorised");
    await expect(await erc1155AccessControl.connect(gatekeeper1).addNftAccessToVaults([vaultA.address], [nft1.address], [[nftId1]]))
      .to.emit(erc1155AccessControl, "VaultAccessGranted")
      .withArgs(vaultA.address, nft1.address, [nftId1]);

    await expect(
      erc1155AccessControl.connect(gatekeeper2).addNftAccessToVaults([vaultA.address], [nft1.address], [[nftId2]])
    ).to.be.revertedWith("not authorised");
    await expect(await erc1155AccessControl.connect(gatekeeper2).addNftAccessToVaults([vaultB.address], [nft1.address], [[nftId2]]))
      .to.emit(erc1155AccessControl, "VaultAccessGranted")
      .withArgs(vaultB.address, nft1.address, [nftId2]);

    await expect(
      erc1155AccessControl.connect(gatekeeper1).removeNftAccessToVaults([vaultB.address], [nft1.address], [[nftId1]])
    ).to.be.revertedWith("not authorised");
    await expect(await erc1155AccessControl.connect(gatekeeper1).removeNftAccessToVaults([vaultA.address], [nft1.address], [[nftId1]]))
      .to.emit(erc1155AccessControl, "VaultAccessRemoved")
      .withArgs(vaultA.address, nft1.address, [nftId1]);

    await expect(
      erc1155AccessControl.connect(gatekeeper2).removeNftAccessToVaults([vaultA.address], [nft1.address], [[nftId2]])
    ).to.be.revertedWith("not authorised");
    await expect(await erc1155AccessControl.connect(gatekeeper2).removeNftAccessToVaults([vaultB.address], [nft1.address], [[nftId2]]))
      .to.emit(erc1155AccessControl, "VaultAccessRemoved")
      .withArgs(vaultB.address, nft1.address, [nftId2]);
  });

  it("should revert if NFT address is not valid", async () => {
    await expect(erc1155AccessControl.connect(owner).addNftAccessToVaults([vaultA.address], [vaultA.address], [[1]])).to.be.revertedWith(
      "!ERC1155"
    );
  });

  it("should revert if parameters are not valid when get access info", async () => {
    expect(erc1155AccessControl.connect(owner).getGlobalNftAccess(ethers.constants.AddressZero)).to.be.revertedWith("!contract");
    expect(erc1155AccessControl.connect(owner).getVaultNftAccess(ethers.constants.AddressZero, nft1.address)).to.be.revertedWith("!vault");
    expect(erc1155AccessControl.connect(owner).getVaultNftAccess(vaultA.address, ethers.constants.AddressZero)).to.be.revertedWith("!contract");
  });

  describe("global access", async () => {
    beforeEach(async () => {
      await nft1.connect(deployer).safeTransferFrom(deployer.address, addr1.address, nftId1, 1, []);
      await nft1.connect(deployer).safeTransferFrom(deployer.address, addr2.address, nftId2, 1, []);
    });

    describe("addGlobalNftAccess", async () => {
      it("only governance can call", async () => {
        await expect(erc1155AccessControl.connect(gatekeeper1).addGlobalNftAccess([nft1.address], [[nftId1]])).to.be.revertedWith(
          "governance only"
        );
      });

      it("should revert if no contracts", async () => {
        await expect(erc1155AccessControl.connect(owner).addGlobalNftAccess([], [[nftId1]])).to.be.revertedWith("!contracts");
      });

      it("should revert if input is not valid", async () => {
        await expect(erc1155AccessControl.connect(owner).addGlobalNftAccess([nft1.address], [])).to.be.revertedWith("!input");
      });

      it("should revert if contract is not ERC1155", async () => {
        await expect(
          erc1155AccessControl.connect(owner).addGlobalNftAccess([nft1.address, vaultA.address], [[nftId1], [nftId2]])
        ).to.be.revertedWith("!ERC1155");
      });

      it("should allow access if NFT is granted global access", async () => {
        expect(await erc1155AccessControl.connect(addr1).hasAccess(addr1.address, vaultA.address)).to.equal(false);
        expect(await erc1155AccessControl.connect(addr1).hasAccess(addr2.address, vaultB.address)).to.equal(false);
        await expect(await erc1155AccessControl.connect(owner).addGlobalNftAccess([nft1.address], [[nftId1, nftId2]]))
          .to.emit(erc1155AccessControl, "VaultAccessGranted")
          .withArgs(ADDRESS_ONE, nft1.address, [nftId1, nftId2]);
        expect(await erc1155AccessControl.connect(addr1).hasAccess(addr1.address, vaultA.address)).to.equal(true);
        expect(await erc1155AccessControl.connect(addr1).hasAccess(addr2.address, vaultB.address)).to.equal(true);
        expect(await erc1155AccessControl.getGlobalNftAccess(nft1.address)).to.deep.equal([BigNumber.from(nftId1), BigNumber.from(nftId2)]);
      });

      it("should use vault level configuration if it's set", async () => {
        // allow nft id 1 to access all vaults
        await erc1155AccessControl.connect(owner).addGlobalNftAccess([nft1.address], [[nftId1]]);
        // addr1 should have access to vault B as there is no vault level config so global default should work
        expect(await erc1155AccessControl.connect(addr1).hasAccess(addr1.address, vaultB.address)).to.equal(true);
        // add vault level config for vault B to only allow nft id 2
        await erc1155AccessControl.connect(owner).addNftAccessToVaults([vaultB.address], [nft1.address], [[nftId2]]);
        // addr1 should not be able to access to it anymore as the account doesn't have nft id 2 tokens
        expect(await erc1155AccessControl.connect(addr1).hasAccess(addr1.address, vaultB.address)).to.equal(false);
        expect(await erc1155AccessControl.getVaultNftAccess(vaultB.address, nft1.address)).to.deep.equal([BigNumber.from(nftId2)]);
      });
    });

    describe("removeGlobalNftAccess", async () => {
      it("only governance can call", async () => {
        await expect(erc1155AccessControl.connect(gatekeeper1).removeGlobalNftAccess([nft1.address], [[nftId1]])).to.be.revertedWith(
          "governance only"
        );
      });

      it("should revert if no contracts", async () => {
        await expect(erc1155AccessControl.connect(owner).removeGlobalNftAccess([], [[nftId1]])).to.be.revertedWith("!contracts");
      });

      it("should revert if input is not valid", async () => {
        await expect(erc1155AccessControl.connect(owner).removeGlobalNftAccess([nft1.address], [])).to.be.revertedWith("!input");
      });

      it("should remove access", async () => {
        await erc1155AccessControl.connect(owner).addGlobalNftAccess([nft1.address], [[nftId1, nftId2]]);
        expect(await erc1155AccessControl.connect(addr1).hasAccess(addr1.address, vaultA.address)).to.equal(true);
        expect(await erc1155AccessControl.connect(addr1).hasAccess(addr2.address, vaultA.address)).to.equal(true);
        await expect(await erc1155AccessControl.connect(owner).removeGlobalNftAccess([nft1.address], [[nftId2]]))
          .to.emit(erc1155AccessControl, "VaultAccessRemoved")
          .withArgs(ADDRESS_ONE, nft1.address, [nftId2]);
        expect(await erc1155AccessControl.connect(addr1).hasAccess(addr1.address, vaultA.address)).to.equal(true);
        expect(await erc1155AccessControl.connect(addr1).hasAccess(addr2.address, vaultA.address)).to.equal(false);
      });
    });
  });
});
