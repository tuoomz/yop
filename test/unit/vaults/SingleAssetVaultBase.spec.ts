import { BigNumber, utils } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { SingleAssetVaultBaseMock, VaultStrategyDataStore, TokenMock } from "../../../types";

function parseBigNumber(bn: BigNumber): number {
  return parseFloat(utils.formatUnits(bn));
}
describe("SingleAssetVaultBase", function () {
  const vaultDecimals = 18;
  let deployer: SignerWithAddress;
  let singleAssetVaultBase: SingleAssetVaultBaseMock;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let rewards: SignerWithAddress;
  let strategyDataStore: VaultStrategyDataStore;
  let token: TokenMock;
  let otherToken: TokenMock;
  let external: SignerWithAddress;

  beforeEach(async () => {
    const accounts = await ethers.getSigners();
    deployer = accounts[0];
    gatekeeper = accounts[1];
    rewards = accounts[2];
    external = accounts[5];
    governance = accounts[6];

    const Token = await ethers.getContractFactory("TokenMock");
    token = (await Token.deploy("LosPolosHermanosToken", "CHICKEN")) as TokenMock;
    await token.deployed();

    const OtherToken = await ethers.getContractFactory("TokenMock");
    otherToken = (await OtherToken.deploy("HeisenbergToken", "CRYSTAL")) as TokenMock;
    await otherToken.deployed();

    const VaultStrategyDataStore = await ethers.getContractFactory("VaultStrategyDataStore");
    strategyDataStore = (await VaultStrategyDataStore.deploy(governance.address)) as VaultStrategyDataStore;
    await strategyDataStore.deployed();

    const SingleAssetVaultBaseMock = await ethers.getContractFactory("SingleAssetVaultBaseMock");
    singleAssetVaultBase = (await SingleAssetVaultBaseMock.deploy(
      "single asset test vault",
      "tSA",
      governance.address,
      gatekeeper.address,
      rewards.address,
      strategyDataStore.address,
      token.address
    )) as SingleAssetVaultBaseMock;
    await singleAssetVaultBase.deployed();
  });

  describe("Basic Data", () => {
    it("Should match basic information", async () => {
      singleAssetVaultBase = singleAssetVaultBase.connect(external);
      expect(await singleAssetVaultBase.name()).to.equal("single asset test vault");
      expect(await singleAssetVaultBase.decimals()).to.equal(vaultDecimals);
      expect(await singleAssetVaultBase.governance()).to.equal(governance.address);
      expect(await singleAssetVaultBase.gatekeeper()).to.equal(gatekeeper.address);
      expect(await singleAssetVaultBase.rewards()).to.equal(rewards.address);
      expect(await singleAssetVaultBase.token()).to.equal(token.address);
    });

    it("Should check initial state", async () => {
      expect(await singleAssetVaultBase.totalAsset()).to.equal(ethers.constants.Zero);
      expect(await singleAssetVaultBase.availableDepositLimit()).to.equal(ethers.constants.MaxUint256);
      expect(await singleAssetVaultBase.maxAvailableShares()).to.equal(ethers.constants.Zero);
      expect(await singleAssetVaultBase.pricePerShare()).to.equal(BigNumber.from(`${10 ** vaultDecimals}`));
      expect(await singleAssetVaultBase.totalDebt()).to.equal(ethers.constants.Zero);
      expect(await singleAssetVaultBase.lockedProfit()).to.equal(ethers.constants.Zero);
    });
  });

  describe("Sweep", () => {
    it("Should allow sweep for full amount", async () => {
      await otherToken.mint(singleAssetVaultBase.address, utils.parseEther("12"));
      const balance = await otherToken.balanceOf(singleAssetVaultBase.address);
      expect(balance).to.equal(utils.parseEther("12"), "Failed to deposit into token");
      await singleAssetVaultBase.connect(governance).sweep(otherToken.address, utils.parseEther("12"));
      expect(await otherToken.balanceOf(singleAssetVaultBase.address)).to.equal(ethers.constants.Zero);
    });

    it("Should revert when sweeping for greater amount than available", async () => {
      await otherToken.mint(singleAssetVaultBase.address, utils.parseEther("12"));
      await expect(singleAssetVaultBase.connect(governance).sweep(otherToken.address, utils.parseEther("13"))).to.be.revertedWith(
        "ERC20: transfer amount exceeds balance"
      );
    });

    it("Should now allow sweep to not governance", async () => {
      await otherToken.mint(singleAssetVaultBase.address, utils.parseEther("12"));
      await expect(singleAssetVaultBase.connect(external).sweep(otherToken.address, utils.parseEther("12"))).to.be.revertedWith(
        "governance only"
      );
    });
  });
});
