import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { BaseUpgradeableMock } from "../../../types/BaseUpgradeableMock";
import { expect } from "chai";
describe("BasePauseableUpgradeable", async () => {
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let user: SignerWithAddress;
  let contract: BaseUpgradeableMock;

  beforeEach(async () => {
    [, governance, gatekeeper, user] = await ethers.getSigners();
    const ContractMock = await ethers.getContractFactory("BaseUpgradeableMock");
    contract = (await ContractMock.deploy()) as BaseUpgradeableMock;
    await contract.initialize(governance.address);
    await contract.deployed();
  });

  describe("authorisedUpgrade", async () => {
    it("only governance can call", async () => {
      await expect(contract.connect(gatekeeper).authorizeUpgrade(ethers.constants.AddressZero)).to.be.revertedWith("governance only");
      await contract.connect(governance).authorizeUpgrade(ethers.constants.AddressZero);
    });
  });
});
