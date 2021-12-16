import chai, { expect } from "chai";

import { ContractFactory } from "@ethersproject/contracts";
import { ethers, network } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { SingleAssetVault, CurveStable, VaultStrategyDataStore, ERC20 } from "../../../types";
import { BigNumber, utils } from "ethers";
import { impersonate } from "../utils/Impersonate";
import { near } from "../utils/near";
import { solidity } from "ethereum-waffle";

chai.use(solidity);
chai.use(near);

describe("Curve Stable Strategy", () => {
  const vault = {
    DAI: {
      name: "vaultDAI",
      symbol: "vDai",
    },
    USDC: {
      name: "vaultUSDC",
      symbol: "vUSDC",
    },
    USDT: {
      name: "vaultUSDT",
      symbol: "vUSDT",
    },
  };

  const coins = {
    DAI: {
      address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      whale: "0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503",
    },
    USDC: {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      whale: "0x036b96eea235880a9e82fb128e5f6c107dfe8f57",
    },
    USDT: {
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      whale: "0xec34c1bf2eb2d2a0f7294928a2bc69f377a8540b",
    },
    USDN: {
      address: "0x674C6Ad92Fd080e4004b2312b45f796a192D27a0",
      whale: "0xc735c59bbc9322a2ac0a1ffa0009e63f6d42aa5e",
    },
    USDN3CRV: {
      address: "0x4f3E8F405CF5aFC05D68142F3783bDfE13811522",
    },
  };

  let curveStableStrategyDai: CurveStable;
  // let curveStableStrategyUsdc: CurveStable;
  // let curveStableStrategyUsdt: CurveStable;
  let SingleAssetVaultFactory: ContractFactory;
  let VaultStrategyDataStoreFactory: ContractFactory;
  let CurveStableFactory: ContractFactory;
  let singleAssetVaultDai: SingleAssetVault;
  let vaultStrategyDataStore: VaultStrategyDataStore;
  let governance: SignerWithAddress;
  let strategist: SignerWithAddress;
  let user: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let rewards: SignerWithAddress;
  let depositor: SignerWithAddress;
  let manager: SignerWithAddress;
  let daiContract: ERC20;
  let usdcContract: ERC20;
  let usdtContract: ERC20;
  let usdnContract: ERC20;

  beforeEach(async () => {
    [, governance, gatekeeper, rewards, depositor, manager, strategist, user] = await ethers.getSigners();
    SingleAssetVaultFactory = await ethers.getContractFactory("SingleAssetVault");
    singleAssetVaultDai = (await SingleAssetVaultFactory.deploy()) as SingleAssetVault;
    await singleAssetVaultDai.deployed();

    VaultStrategyDataStoreFactory = await ethers.getContractFactory("VaultStrategyDataStore");
    vaultStrategyDataStore = (await VaultStrategyDataStoreFactory.deploy(governance.address)) as VaultStrategyDataStore;
    await vaultStrategyDataStore.deployed();

    await singleAssetVaultDai.initialize(
      vault.DAI.name,
      vault.DAI.symbol,
      governance.address,
      gatekeeper.address,
      rewards.address,
      vaultStrategyDataStore.address,
      coins.DAI.address,
      ethers.constants.AddressZero
    );

    vaultStrategyDataStore.connect(governance).setVaultManager(singleAssetVaultDai.address, manager.address);

    daiContract = (await ethers.getContractAt("ERC20", coins.DAI.address)) as ERC20;
    usdcContract = (await ethers.getContractAt("ERC20", coins.USDC.address)) as ERC20;
    usdtContract = (await ethers.getContractAt("ERC20", coins.USDT.address)) as ERC20;
    usdnContract = (await ethers.getContractAt("ERC20", coins.USDN.address)) as ERC20;

    CurveStableFactory = await ethers.getContractFactory("CurveStable");
    curveStableStrategyDai = (await CurveStableFactory.deploy(singleAssetVaultDai.address)) as CurveStable;
    await curveStableStrategyDai.deployed();
    await singleAssetVaultDai.connect(governance).unpause();
  });

  describe("Basic Setup", async () => {
    beforeEach(async () => {
      const sDebtRatio = BigNumber.from("9500"); // 90%
      const sMinDebtPerHarvest = BigNumber.from("0");
      const sMaxDebtPerHarvest = ethers.constants.MaxUint256;
      const sPerformanceFee = BigNumber.from("100"); // 1%

      await vaultStrategyDataStore
        .connect(manager)
        .addStrategy(
          singleAssetVaultDai.address,
          curveStableStrategyDai.address,
          sDebtRatio,
          sMinDebtPerHarvest,
          sMaxDebtPerHarvest,
          sPerformanceFee
        );

      await daiContract.connect(await impersonate(coins.DAI.whale)).approve(singleAssetVaultDai.address, ethers.constants.MaxInt256);
      await singleAssetVaultDai.connect(await impersonate(coins.DAI.whale)).deposit(1000, depositor.address);
      await curveStableStrategyDai.connect(governance).setStrategist(strategist.address);
    });

    it("Should return the correct api version", async () => {
      const apyVersion = "0.0.1";
      expect(await curveStableStrategyDai.apiVersion()).to.equal(apyVersion);
    });

    it("Should set the strategist", async () => {
      expect(await curveStableStrategyDai.connect(governance).setStrategist(strategist.address))
        .to.emit(curveStableStrategyDai, "UpdatedStrategist")
        .withArgs(strategist.address);
    });

    it("Should not set the strategist to the 0 address", async () => {
      expect(curveStableStrategyDai.connect(governance).setStrategist(ethers.constants.AddressZero)).to.be.revertedWith("! address 0");
    });

    it("Should set the keeper", async () => {
      expect(await curveStableStrategyDai.connect(governance).setKeeper(user.address))
        .to.emit(curveStableStrategyDai, "UpdatedKeeper")
        .withArgs(user.address);
    });

    it("Should not set the keeper to the 0 address", async () => {
      expect(curveStableStrategyDai.connect(governance).setStrategist(ethers.constants.AddressZero)).to.be.revertedWith("! address 0");
    });

    it("Should set the rewards", async () => {
      expect(await curveStableStrategyDai.connect(strategist).setRewards(rewards.address))
        .to.emit(curveStableStrategyDai, "UpdatedRewards")
        .withArgs(rewards.address);
    });

    it("Should not set the rewards to the 0 address", async () => {
      expect(curveStableStrategyDai.connect(strategist).setRewards(ethers.constants.AddressZero)).to.be.revertedWith("! address 0");
    });

    it("Should set the vault", async () => {
      expect(await curveStableStrategyDai.connect(governance).setVault(singleAssetVaultDai.address))
        .to.emit(curveStableStrategyDai, "UpdatedVault")
        .withArgs(singleAssetVaultDai.address);
    });

    it("Should not set the vault to the 0 address", async () => {
      expect(curveStableStrategyDai.connect(strategist).setVault(ethers.constants.AddressZero)).to.be.revertedWith("! address 0");
    });

    it("Should set the minReportDelay", async () => {
      const minReportDelay = 0;
      expect(await curveStableStrategyDai.connect(governance).setMinReportDelay(minReportDelay))
        .to.emit(curveStableStrategyDai, "UpdatedMinReportDelay")
        .withArgs(minReportDelay);
    });

    it("Should set the maxReportDelay", async () => {
      const maxReportDelay = 100;
      expect(await curveStableStrategyDai.connect(governance).setMaxReportDelay(maxReportDelay))
        .to.emit(curveStableStrategyDai, "UpdatedMaxReportDelay")
        .withArgs(maxReportDelay);
    });

    it("Should set the debtThreshold", async () => {
      const debtThreshold = 100;
      expect(await curveStableStrategyDai.connect(governance).setDebtThreshold(debtThreshold))
        .to.emit(curveStableStrategyDai, "UpdatedDebtThreshold")
        .withArgs(debtThreshold);
    });

    it("Should set the profitFactor", async () => {
      const profitFactor = 100;
      expect(await curveStableStrategyDai.connect(governance).setProfitFactor(profitFactor))
        .to.emit(curveStableStrategyDai, "UpdatedProfitFactor")
        .withArgs(profitFactor);
    });

    it("Should set the setMetadataURI", async () => {
      const setMetadataURI = "http://test.com";
      expect(await curveStableStrategyDai.connect(governance).setMetadataURI(setMetadataURI))
        .to.emit(curveStableStrategyDai, "UpdatedMetadataURI")
        .withArgs(setMetadataURI);
    });

    it("Should be able to check if the strategy is active", async () => {
      expect(await curveStableStrategyDai.isActive()).to.be.equal(true);
      await vaultStrategyDataStore.connect(governance).updateStrategyDebtRatio(singleAssetVaultDai.address, curveStableStrategyDai.address, 0);
      expect(await curveStableStrategyDai.isActive()).to.be.equal(false);
    });

    it("Should be able to harvest", async () => {
      console.log(">>>>>");
      expect(await curveStableStrategyDai.connect(governance).harvest()).to.emit(curveStableStrategyDai, "Harvested");
    });
  });

  describe("Curve Deposit", async () => {
    const depositAmount = BigNumber.from("10").mul(ethers.constants.WeiPerEther);
    let sDebtRatio = BigNumber.from("9500");
    beforeEach(async () => {
      sDebtRatio = BigNumber.from("9500"); // 90%
      const sMinDebtPerHarvest = BigNumber.from("0");
      const sMaxDebtPerHarvest = ethers.constants.MaxUint256;
      const sPerformanceFee = BigNumber.from("100"); // 1%

      await vaultStrategyDataStore
        .connect(manager)
        .addStrategy(
          singleAssetVaultDai.address,
          curveStableStrategyDai.address,
          sDebtRatio,
          sMinDebtPerHarvest,
          sMaxDebtPerHarvest,
          sPerformanceFee
        );

      await daiContract.connect(await impersonate(coins.DAI.whale)).approve(singleAssetVaultDai.address, ethers.constants.MaxInt256);
      await singleAssetVaultDai.connect(await impersonate(coins.DAI.whale)).deposit(depositAmount, depositor.address);
      await curveStableStrategyDai.connect(governance).setStrategist(strategist.address);
    });

    it("should withdraw correct amount", async () => {
      await curveStableStrategyDai.harvest();
      const maxLoss = 1000; // 10 percent in basis points
      expect((await daiContract.balanceOf(depositor.address)).toNumber()).to.be.equal(0);
      await singleAssetVaultDai.connect(depositor).withdraw(500, depositor.address, maxLoss);
      expect((await daiContract.balanceOf(depositor.address)).toNumber()).to.be.closeTo(500, 30);
    });

    it("should now withdraw more than deposited amount", async () => {
      await curveStableStrategyDai.harvest();
      const maxLoss = 1000; // 10 percent in basis points
      expect((await daiContract.balanceOf(depositor.address)).toNumber()).to.be.equal(0);
      await singleAssetVaultDai.connect(depositor).withdraw(depositAmount.mul(2), depositor.address, maxLoss);
      expect(await daiContract.balanceOf(depositor.address)).to.be.near(depositAmount, 1000);
    });

    it("should get correct balance og pool", async () => {
      await curveStableStrategyDai.harvest();
      await ethers.provider.send("evm_increaseTime", [14400]);
      await ethers.provider.send("evm_mine", []);
      // const res = await curveStableStrategyDai.harvest();
      const res = await curveStableStrategyDai.balanceOfPoolInWantNow();
      const poolBalance = BigNumber.from(res.data);
      expect(poolBalance).to.be.gt(0);
    });
    it("should get some profit", async () => {
      // jump the time forward to generate a profit on convex
      await curveStableStrategyDai.harvest();
      await ethers.provider.send("evm_increaseTime", [7200]);
      await ethers.provider.send("evm_mine", []);
      const res = await curveStableStrategyDai.harvest();
      const ff = await curveStableStrategyDai.balanceOfPoolInWantNow();
      const profit = 32869;
      const totalDebt = 950000000;
      const tx = await curveStableStrategyDai.harvest();
      const txRec = await tx.wait();
      console.log("");
      // expect(await curveStableStrategyDai.harvest())
      //   .to.emit(singleAssetVaultDai, "StrategyReported")
      //   .withArgs(curveStableStrategyDai.address, profit, 0, 0, profit, 0, totalDebt, 0, sDebtRatio);
    });

    it("Should have 'want' coin index from Curve pool set up", async () => {
      expect(await curveStableStrategyDai.wantCurveDepositIndex()).to.be.equal(0);
      // expect(await curveStableStrategyUsdc.wantCurveDepositIndex()).to.be.equal(1);
      // expect(await curveStableStrategyUsdt.wantCurveDepositIndex()).to.be.equal(2);
    });

    it("balance of pool", async () => {
      await network.provider.send("evm_increaseTime", [1800]);
      await network.provider.send("evm_mine");
      let balanceOfWant = await curveStableStrategyDai.balanceOfWant();
      let balanceOfPoolInWant = await curveStableStrategyDai.balanceOfPoolInWantNow();
      await curveStableStrategyDai.harvest();
      await network.provider.send("evm_increaseTime", [180000]);
      await network.provider.send("evm_mine");
      balanceOfPoolInWant = await curveStableStrategyDai.balanceOfPoolInWantNow();
      await network.provider.send("evm_increaseTime", [180000]);
      await network.provider.send("evm_mine");
      balanceOfPoolInWant = await curveStableStrategyDai.balanceOfPoolInWantNow();
      balanceOfWant = await curveStableStrategyDai.balanceOfWant();
    });

    // it("withdraw", async () => {});

    it("Should 1000 want in lp", async () => {
      // conversion rates are taken directly from curve contract https://etherscan.io/address/0x094d12e5b541784701FD8d65F11fc0598FBC6332#readContract
      // const res = (await curveStableStrategyDai.getWantInLp(10000)).toNumber();
      console.log(">>>>>");
      // expect(await curveStableStrategyDai.getWantInCrv(10000)).to.be.closeTo(BigNumber.from(2200), 500);
      // expect(await curveStableStrategyUsdc.getWantInLps(1000)).to.be.closeTo(BigNumber.from(990 * 10 ** 12), 2 * 10 ** 12);
      // // usdt comes back as 0 from curve
      // expect(await curveStableStrategyUsdt.getWantInLps(1000)).to.be.closeTo(BigNumber.from(990 * 10 ** 12), 2 * 10 ** 12);
    });

    it("Should test loss", async () => {
      const res = await curveStableStrategyDai.harvest();

      // lower max debt ratio by 50% - from 50% to 25%
      await vaultStrategyDataStore
        .connect(governance)
        .updateStrategyDebtRatio(singleAssetVaultDai.address, curveStableStrategyDai.address, BigNumber.from("2500"));

      const res2 = await curveStableStrategyDai.harvest();
      console.log(">>>>>");
      // conversion rates are taken directly from curve contract https://etherscan.io/address/0x094d12e5b541784701FD8d65F11fc0598FBC6332#readContract
    });
  });
});
