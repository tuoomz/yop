import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { BasePauseableUpgradeableMock } from "../../../types/BasePauseableUpgradeableMock";
import { expect } from "chai";
describe("BasePauseableUpgradeable", async () => {
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let user: SignerWithAddress;
  let contract: BasePauseableUpgradeableMock;

  beforeEach(async () => {
    [, governance, gatekeeper, user] = await ethers.getSigners();
    const ContractMock = await ethers.getContractFactory("BasePauseableUpgradeableMock");
    contract = (await ContractMock.deploy()) as BasePauseableUpgradeableMock;
    await contract.initialize(governance.address, gatekeeper.address);
    await contract.deployed();
  });
  describe("setGatekeeper", async () => {
    it("only governance can set gatekeeper", async () => {
      expect(contract.connect(gatekeeper).setGatekeeper(user.address)).to.be.revertedWith("governance only");
    });

    it("should change gatekeeper", async () => {
      expect(await contract.gatekeeper()).to.equal(gatekeeper.address);
      await expect(await contract.connect(governance).setGatekeeper(user.address))
        .to.emit(contract, "GatekeeperUpdated")
        .withArgs(user.address);
      expect(await contract.gatekeeper()).to.equal(user.address);
    });
  });

  describe("pause/unpause", async () => {
    it("governance can pause", async () => {
      const paused = await contract.paused();
      expect(paused).to.equal(false);
      await expect(contract.connect(user).pause()).to.be.revertedWith("!authorised");
      await expect(await contract.connect(governance).pause())
        .to.emit(contract, "Paused")
        .withArgs(governance.address);
    });

    it("gatekeeper can pause", async () => {
      const paused = await contract.paused();
      expect(paused).to.equal(false);
      await expect(contract.connect(user).pause()).to.be.revertedWith("!authorised");
      await expect(await contract.connect(gatekeeper).pause())
        .to.emit(contract, "Paused")
        .withArgs(gatekeeper.address);
    });

    it("only governance can unpause", async () => {
      await contract.connect(governance).pause();
      const paused = await contract.paused();
      expect(paused).to.equal(true);
      await expect(contract.connect(gatekeeper).unpause()).to.be.revertedWith("governance only");
      await expect(await contract.connect(governance).unpause())
        .to.emit(contract, "Unpaused")
        .withArgs(governance.address);
    });
  });

  describe("authorisedUpgrade", async () => {
    it("only governance can call", async () => {
      await expect(contract.connect(gatekeeper).authorisedUpgrade(ethers.constants.AddressZero)).to.be.revertedWith("governance only");
      await contract.connect(governance).authorisedUpgrade(ethers.constants.AddressZero);
    });
  });
});
