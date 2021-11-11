import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Governable } from "../../../../types/Governable";

describe("Governable", async () => {
  let governable: Governable;
  let governance: SignerWithAddress;
  let pendingGovernance: SignerWithAddress;
  let user: SignerWithAddress;

  beforeEach(async () => {
    [, governance, pendingGovernance, user] = await ethers.getSigners();
    const Gonvernable = await ethers.getContractFactory("Governable");
    governable = (await Gonvernable.deploy(governance.address)) as Governable;
    await governable.deployed();
  });

  it("test governance", async () => {
    expect(await governable.governance()).to.equal(governance.address);
    expect(await governable.pendingGovernance()).to.equal(ethers.constants.AddressZero);
  });

  it("test proposeGovernance", async () => {
    expect(governable.connect(user).proposeGovernance(pendingGovernance.address)).to.be.revertedWith("governance only");
    expect(governable.connect(governance).proposeGovernance(ethers.constants.AddressZero)).to.be.revertedWith("invalid address");
    expect(governable.connect(governance).proposeGovernance(governance.address)).to.be.revertedWith("already the governance");
    expect(await governable.connect(governance).proposeGovernance(pendingGovernance.address))
      .to.emit(governable, "GovenanceProposed")
      .withArgs(pendingGovernance.address);
  });

  it("test acceptGovernance", async () => {
    expect(governable.connect(pendingGovernance).acceptGovernance()).to.be.revertedWith("pending governance only");
    await governable.connect(governance).proposeGovernance(pendingGovernance.address);
    expect(governable.connect(user).acceptGovernance()).to.be.revertedWith("pending governance only");
    expect(await governable.connect(pendingGovernance).acceptGovernance())
      .to.emit(governable, "GovenanceUpdated")
      .withArgs(pendingGovernance.address);
    expect(await governable.governance()).to.equal(pendingGovernance.address);
  });
});
