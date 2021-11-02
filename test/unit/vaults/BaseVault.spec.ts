import { expect } from "chai";
import { ethers } from "hardhat";

describe("BaseVault", function () {
  let baseVault: any;

  beforeEach(async () => {
    const [owner, addr1] = await ethers.getSigners();
    const BaseVaultMock = await ethers.getContractFactory("BaseVaultMock");
    baseVault = await BaseVaultMock.deploy("test vault", "tVault", 18, 100, addr1.address, owner.address, owner.address);
    await baseVault.deployed();
  });

  it("Should return vault name", async () => {
    expect(await baseVault.name()).to.equal("test vault");
  });
});
