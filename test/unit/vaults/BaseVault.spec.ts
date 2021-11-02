import { expect } from "chai";
import { ethers } from "hardhat";

describe("BaseVault", function () {
  let baseVault: any;

  beforeEach(async () => {
    const [owner, addr1] = await ethers.getSigners();
    const BaseVaultMock = await ethers.getContractFactory("BaseVaultMock");
    baseVault = await BaseVaultMock.deploy(
      "test vault",
      "tVault",
      18,
      owner.address,
      owner.address,
      addr1.address,
      ethers.constants.AddressZero
    );
    await baseVault.deployed();
  });

  it("Should return vault name", async () => {
    expect(await baseVault.name()).to.equal("test vault");
  });
});
