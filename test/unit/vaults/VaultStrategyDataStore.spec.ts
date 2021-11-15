import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ContractFactory } from "@ethersproject/contracts";
// eslint-disable-next-line node/no-missing-import
import { BaseVaultMock, StrategyMock, VaultStrategyDataStore } from "../../../types";
import { expect } from "chai";
import { ethers } from "hardhat";
import { constants, ContractTransaction } from "ethers";
import { impersonate } from "../utils/Impersonate";

describe("VaultStrategyDataStore", function () {
  let rewards: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let governer: SignerWithAddress;
  let addr: SignerWithAddress;
  let VaultStrategyDataStoreFactory: ContractFactory;
  let BaseVaultMockFactroy: ContractFactory;
  let StrategyMockFactory: ContractFactory;
  let vaultStrategyDS: VaultStrategyDataStore;
  let strategyA: StrategyMock;
  let strategyB: StrategyMock;
  let vaultMock: BaseVaultMock;
  const addr0 = ethers.constants.AddressZero;
  const vaultDummy = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const debtRatio = 3000;
  const maxTotalDebtRatio = 9900;
  const vaultMaxTotalDebtRatio = 9500;
  const minDebtPerHarvest = 20;
  const maxDebtPerHarvest = 100;
  const performanceFee = 1000;

  const name = "VaultA";
  const symbol = "VA";
  const decimals = 100;

  beforeEach(async function () {
    [, gatekeeper, governer, rewards, addr] = await ethers.getSigners();
    StrategyMockFactory = await ethers.getContractFactory("StrategyMock");
    VaultStrategyDataStoreFactory = await ethers.getContractFactory("VaultStrategyDataStore");
    BaseVaultMockFactroy = await ethers.getContractFactory("BaseVaultMock");
    strategyA = (await StrategyMockFactory.deploy(constants.AddressZero)) as StrategyMock;
    strategyB = (await StrategyMockFactory.deploy(constants.AddressZero)) as StrategyMock;
    vaultStrategyDS = (await VaultStrategyDataStoreFactory.deploy(governer.address)) as VaultStrategyDataStore;
    vaultMock = (await BaseVaultMockFactroy.deploy(
      name,
      symbol,
      governer.address,
      gatekeeper.address,
      rewards.address,
      vaultStrategyDS.address
    )) as BaseVaultMock;

    await vaultStrategyDS
      .connect(governer)
      .addStrategy(vaultMock.address, strategyA.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
  });

  it("should be able to add a strategy", async function () {
    expect(
      vaultStrategyDS.connect(governer).addStrategy(vaultDummy, addr0, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee)
    ).to.be.revertedWith("strategy address is not valid");
    vaultStrategyDS
      .connect(governer)
      .addStrategy(vaultMock.address, strategyB.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);

    expect(await vaultStrategyDS.strategyDebtRatio(vaultMock.address, strategyB.address)).to.be.equal(debtRatio);
    expect(await vaultStrategyDS.strategyMinDebtPerHarvest(vaultMock.address, strategyB.address)).to.be.equal(minDebtPerHarvest);
    expect(await vaultStrategyDS.strategyMaxDebtPerHarvest(vaultMock.address, strategyB.address)).to.be.equal(maxDebtPerHarvest);
    expect(await vaultStrategyDS.strategyPerformanceFee(vaultMock.address, strategyB.address)).to.be.equal(performanceFee);
  });

  it("should revert when adding strategy where minDebtPerHarvest > maxDebtPerHarvest", async function () {
    const largeMinDebtPerHarvest = 10000;
    expect(
      vaultStrategyDS
        .connect(governer)
        .addStrategy(vaultMock.address, strategyB.address, debtRatio, largeMinDebtPerHarvest, maxDebtPerHarvest, performanceFee)
    ).to.be.revertedWith("invalid minDebtPerHarvest value");
  });

  it("should revert when setting minDebtPerHarvest > maxDebtPerHarvest", async function () {
    const largeMinDebtPerHarvest = 10000;
    expect(
      vaultStrategyDS.connect(governer).updateStrategyMinDebtHarvest(vaultMock.address, strategyA.address, largeMinDebtPerHarvest)
    ).to.be.revertedWith("invalid minDebtPerHarvest");
  });

  it("should revert when setting maxDebtPerHarvest < minDebtPerHarvest", async function () {
    const samllMaxDebtPerHarvest = 10;
    expect(
      vaultStrategyDS.connect(governer).updateStrategyMaxDebtHarvest(vaultMock.address, strategyA.address, samllMaxDebtPerHarvest)
    ).to.be.revertedWith("invalid maxDebtPerHarvest");
  });

  it("should revert when total debt ratio is over limit", async function () {
    const largeDebtRatio = 10000;
    expect(
      vaultStrategyDS
        .connect(governer)
        .addStrategy(vaultMock.address, strategyB.address, largeDebtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee)
    ).to.be.revertedWith("total debtRatio over limit");
  });

  it("should revert when performace fee is too large", async function () {
    const largePerformaceFee = 10000;
    expect(
      vaultStrategyDS.connect(governer).updateStrategyPerformanceFee(vaultMock.address, strategyA.address, largePerformaceFee)
    ).to.be.revertedWith("invalid performance fee");
  });

  it("should revert when unauthorised user adds strategy", async function () {
    expect(
      vaultStrategyDS.addStrategy(vaultMock.address, strategyA.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee)
    ).to.be.revertedWith("not authorised");
  });

  it("should revert when adding more than the max number of strategies", async function () {
    const withdrawQueue: string[] = Array(20).fill(strategyA.address);
    await vaultStrategyDS.connect(governer).setWithdrawQueue(vaultMock.address, withdrawQueue);
    expect(
      vaultStrategyDS
        .connect(governer)
        .addStrategy(vaultMock.address, strategyA.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee)
    ).to.be.revertedWith("too many strategies");
  });

  it("should not add a strategy that has allready been added", async function () {
    expect(
      vaultStrategyDS
        .connect(governer)
        .addStrategy(vaultMock.address, strategyA.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee)
    ).to.be.revertedWith("strategy already added");
  });

  it("should set the correct strategy performace fee", async function () {
    expect(await vaultStrategyDS.strategyPerformanceFee(vaultMock.address, strategyB.address)).to.be.equal(0);
    expect(vaultStrategyDS.strategyPerformanceFee(addr0, addr0)).to.be.revertedWith("invalid address");
    expect(await vaultStrategyDS.strategyPerformanceFee(vaultMock.address, strategyA.address)).to.be.equal(performanceFee);
    expect(await vaultStrategyDS.strategyPerformanceFee(vaultMock.address, strategyB.address)).to.be.equal(0);
  });

  it("should return the correct activation", async function () {
    const ct: ContractTransaction = await vaultStrategyDS
      .connect(governer)
      .addStrategy(vaultMock.address, strategyB.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);

    const blocknumber = (await ct.wait()).blockNumber;
    const timestamp = (await ethers.provider.getBlock(blocknumber)).timestamp;
    expect(vaultStrategyDS.strategyActivation(addr0, addr0)).to.be.revertedWith("invalid address");
    // Need the extra .toNumber function here as you can't do closeTo comparison on a BigNumber
    expect((await vaultStrategyDS.strategyActivation(vaultMock.address, strategyA.address)).toNumber()).to.be.closeTo(timestamp, 5);
    expect(await vaultStrategyDS.strategyActivation(vaultDummy, strategyB.address)).to.be.equal(0);
  });

  it("should retrun the correct strategyDebtRatio", async function () {
    expect(vaultStrategyDS.strategyDebtRatio(addr0, addr0)).to.be.revertedWith("invalid address");
    expect(await vaultStrategyDS.strategyDebtRatio(vaultMock.address, strategyA.address)).to.be.equal(debtRatio);
    expect(await vaultStrategyDS.strategyDebtRatio(vaultMock.address, strategyB.address)).to.be.equal(0);
  });

  it("should retrun the correct strategyMinDebtPerHarvest", async function () {
    expect(vaultStrategyDS.strategyMinDebtPerHarvest(addr0, addr0)).to.be.revertedWith("invalid address");
    expect(await vaultStrategyDS.strategyMinDebtPerHarvest(vaultMock.address, strategyA.address)).to.be.equal(minDebtPerHarvest);
    expect(await vaultStrategyDS.strategyMinDebtPerHarvest(vaultMock.address, strategyB.address)).to.be.equal(0);
  });

  it("should retrun the correct strategyMaxDebtPerHarvest", async function () {
    expect(vaultStrategyDS.strategyMaxDebtPerHarvest(addr0, addr0)).to.be.revertedWith("invalid address");
    expect(await vaultStrategyDS.strategyMaxDebtPerHarvest(vaultMock.address, strategyA.address)).to.be.equal(maxDebtPerHarvest);
    expect(await vaultStrategyDS.strategyMaxDebtPerHarvest(vaultMock.address, strategyB.address)).to.be.equal(ethers.constants.MaxUint256);
  });

  it("should retrun the correct vaultTotalDebtRatio", async function () {
    expect(vaultStrategyDS.vaultTotalDebtRatio(addr0)).to.be.revertedWith("invalid vault");
    expect(await vaultStrategyDS.vaultTotalDebtRatio(vaultMock.address)).to.be.equal(3000);
    expect(await vaultStrategyDS.vaultTotalDebtRatio(vaultDummy)).to.be.equal(0);
  });

  it("should retrun the correct withdrawQueue", async function () {
    expect(vaultStrategyDS.withdrawQueue(addr0)).to.be.revertedWith("invalid vault");
    expect(await vaultStrategyDS.withdrawQueue(vaultMock.address)).to.deep.equal([strategyA.address]);
  });

  it("should retrun the correct vaultManager", async function () {
    expect(vaultStrategyDS.vaultManager(addr0)).to.be.revertedWith("invalid vault");
    expect(await vaultStrategyDS.vaultManager(vaultMock.address)).to.be.equal(addr0);
    expect(await vaultStrategyDS.vaultManager(vaultDummy)).to.be.equal(addr0);
  });

  it("should retrun the correct vaultMaxTotalDebtRatio", async function () {
    expect(vaultStrategyDS.connect(governer).vaultMaxTotalDebtRatio(addr0)).to.be.revertedWith("invalid vault");
    expect(await vaultStrategyDS.vaultMaxTotalDebtRatio(vaultMock.address)).to.be.equal(vaultMaxTotalDebtRatio);
    expect(await vaultStrategyDS.vaultMaxTotalDebtRatio(vaultDummy)).to.be.equal(vaultMaxTotalDebtRatio);
  });
  it("should set the correct vaultManager", async function () {
    expect(vaultStrategyDS.connect(governer).setVaultManager(addr0, addr.address)).to.be.revertedWith("invalid vault");
    expect(vaultStrategyDS.setVaultManager(vaultMock.address, addr.address)).to.be.revertedWith("governance only");
    expect(await vaultStrategyDS.connect(governer).setVaultManager(vaultMock.address, addr.address)).to.emit(
      vaultStrategyDS,
      "VaultManagerUpdated"
    );
    expect(await vaultStrategyDS.vaultManager(vaultMock.address)).to.be.equal(addr.address);
  });
  it("should not emmit event when settign the same vault manager again", async function () {
    await vaultStrategyDS.connect(governer).setVaultManager(vaultMock.address, addr.address);
    expect(await vaultStrategyDS.vaultManager(vaultMock.address)).to.be.equal(addr.address);
    expect(await vaultStrategyDS.connect(governer).setVaultManager(vaultMock.address, addr.address)).to.not.emit(
      vaultStrategyDS,
      "VaultManagerUpdated"
    );
  });

  it("should set the correct MaxTotalDebtRatio", async function () {
    expect(vaultStrategyDS.connect(governer).setMaxTotalDebtRatio(addr0, maxTotalDebtRatio)).to.be.revertedWith("invalid vault");
    expect(vaultStrategyDS.connect(governer).setMaxTotalDebtRatio(vaultMock.address, 10001)).to.be.revertedWith("invalid value");
    expect(vaultStrategyDS.setMaxTotalDebtRatio(vaultMock.address, maxTotalDebtRatio)).to.be.revertedWith("not authorised");
    expect(await vaultStrategyDS.connect(governer).setMaxTotalDebtRatio(vaultMock.address, maxTotalDebtRatio)).to.emit(
      vaultStrategyDS,
      "MaxTotalRatioUpdated"
    );
    expect(await vaultStrategyDS.vaultMaxTotalDebtRatio(vaultMock.address)).to.be.equal(maxTotalDebtRatio);
    expect(await vaultStrategyDS.connect(governer).setMaxTotalDebtRatio(vaultMock.address, maxTotalDebtRatio)).to.not.emit(
      vaultStrategyDS,
      "MaxTotalRatioUpdated"
    );
  });

  it("should updateStrategyPerformanceFee", async function () {
    expect(vaultStrategyDS.connect(governer).updateStrategyPerformanceFee(addr0, strategyA.address, performanceFee)).to.be.revertedWith(
      "invalid vault"
    );
    expect(vaultStrategyDS.updateStrategyPerformanceFee(vaultMock.address, strategyA.address, performanceFee)).to.be.revertedWith(
      "governance only"
    );
    expect(await vaultStrategyDS.connect(governer).updateStrategyPerformanceFee(vaultMock.address, strategyA.address, performanceFee));
    expect(await vaultStrategyDS.strategyPerformanceFee(vaultMock.address, strategyA.address)).to.be.equal(performanceFee);
  });

  it("should updateStrategyDebtRatio", async function () {
    const newStrategyDebtRatio = 8000;
    expect(vaultStrategyDS.connect(governer).updateStrategyDebtRatio(addr0, strategyA.address, newStrategyDebtRatio)).to.be.revertedWith(
      "invalid vault"
    );
    expect(vaultStrategyDS.updateStrategyDebtRatio(vaultMock.address, strategyA.address, newStrategyDebtRatio)).to.be.revertedWith(
      "not authorised"
    );
    expect(await vaultStrategyDS.connect(governer).updateStrategyDebtRatio(vaultMock.address, strategyA.address, newStrategyDebtRatio));
    expect(await vaultStrategyDS.strategyDebtRatio(vaultMock.address, strategyA.address)).to.be.equal(newStrategyDebtRatio);
  });

  it("should updateStrategyMinDebtHarvest", async function () {
    const newMinDebtHarvest = 50;
    expect(vaultStrategyDS.connect(governer).updateStrategyMinDebtHarvest(addr0, strategyA.address, newMinDebtHarvest)).to.be.revertedWith(
      "invalid vault"
    );
    expect(vaultStrategyDS.updateStrategyMinDebtHarvest(vaultMock.address, strategyA.address, newMinDebtHarvest)).to.be.revertedWith(
      "not authorised"
    );
    expect(await vaultStrategyDS.connect(governer).updateStrategyMinDebtHarvest(vaultMock.address, strategyA.address, newMinDebtHarvest));
    expect(await vaultStrategyDS.strategyMinDebtPerHarvest(vaultMock.address, strategyA.address)).to.be.equal(newMinDebtHarvest);
  });

  it("should updateStrategyMaxDebtHarvest", async function () {
    const newManDebtHarvest = 150;
    expect(vaultStrategyDS.connect(governer).updateStrategyMaxDebtHarvest(addr0, strategyA.address, newManDebtHarvest)).to.be.revertedWith(
      "invalid vault"
    );
    expect(vaultStrategyDS.updateStrategyMaxDebtHarvest(vaultMock.address, strategyA.address, newManDebtHarvest)).to.be.revertedWith(
      "not authorised"
    );
    expect(await vaultStrategyDS.connect(governer).updateStrategyMaxDebtHarvest(vaultMock.address, strategyA.address, newManDebtHarvest));
    expect(await vaultStrategyDS.strategyMaxDebtPerHarvest(vaultMock.address, strategyA.address)).to.be.equal(newManDebtHarvest);
  });

  it("should setWithdrawQueue", async function () {
    expect(vaultStrategyDS.connect(governer).setWithdrawQueue(addr0, [strategyA.address])).to.be.revertedWith("invalid vault");
    expect(await vaultStrategyDS.withdrawQueue(vaultDummy)).to.deep.equal([]);
    expect(vaultStrategyDS.setWithdrawQueue(vaultMock.address, [strategyA.address])).to.be.revertedWith("not authorised");
    expect(vaultStrategyDS.connect(governer).setWithdrawQueue(vaultMock.address, [strategyA.address]));
    expect(await vaultStrategyDS.withdrawQueue(vaultMock.address)).to.be.deep.equal([strategyA.address]);
  });

  it("should revert when withdraw is two large", async function () {
    const largeWithdrawQueue = Array(21).fill(strategyA.address);
    expect(vaultStrategyDS.connect(governer).setWithdrawQueue(vaultMock.address, largeWithdrawQueue)).to.be.revertedWith("invalid queue size");
  });

  it("should revert when adding inactive strategy to withdraw queue ", async function () {
    expect(vaultStrategyDS.connect(governer).setWithdrawQueue(vaultMock.address, [strategyB.address])).to.be.revertedWith("invalid queue");
  });

  it("should not add exisiting strategy to withdraw queue ", async function () {
    expect(vaultStrategyDS.connect(governer).addStrategyToWithdrawQueue(vaultMock.address, strategyA.address)).to.be.revertedWith(
      "strategy already exist"
    );
  });

  it("should not add strategy when withdraw queue is full ", async function () {
    const largeWithdrawQueue = Array(20).fill(strategyA.address);
    await vaultStrategyDS.connect(governer).setWithdrawQueue(vaultMock.address, largeWithdrawQueue);
    expect(vaultStrategyDS.connect(governer).addStrategyToWithdrawQueue(vaultMock.address, strategyA.address)).to.be.revertedWith(
      "too many strategies"
    );
  });

  it("should handle remove strategy that is not on the queue ", async function () {
    await vaultStrategyDS.connect(governer).setWithdrawQueue(vaultMock.address, []);
    expect(vaultStrategyDS.connect(governer).removeStrategyFromWithdrawQueue(vaultMock.address, strategyA.address)).to.be.revertedWith(
      "strategy does not exist"
    );
  });

  it("should be able to add and remove strategies from the withdraw queue", async function () {
    expect(vaultStrategyDS.connect(governer).removeStrategyFromWithdrawQueue(addr0, strategyA.address)).to.be.revertedWith("invalid vault");
    expect(vaultStrategyDS.removeStrategyFromWithdrawQueue(vaultMock.address, strategyA.address)).to.be.revertedWith("not authorised");
    expect(vaultStrategyDS.connect(governer).addStrategyToWithdrawQueue(addr0, strategyA.address)).to.be.revertedWith("invalid vault");
    await vaultStrategyDS
      .connect(governer)
      .addStrategy(vaultMock.address, strategyB.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
    await vaultStrategyDS.connect(governer).setWithdrawQueue(vaultMock.address, []);
    await vaultStrategyDS.connect(governer).addStrategyToWithdrawQueue(vaultMock.address, strategyA.address);
    expect(await vaultStrategyDS.connect(governer).withdrawQueue(vaultMock.address)).to.be.deep.equal([strategyA.address]);
    await vaultStrategyDS.connect(governer).addStrategyToWithdrawQueue(vaultMock.address, strategyB.address);
    expect(await vaultStrategyDS.connect(governer).withdrawQueue(vaultMock.address)).to.be.deep.equal([strategyA.address, strategyB.address]);
    await vaultStrategyDS.connect(governer).removeStrategyFromWithdrawQueue(vaultMock.address, strategyA.address);
    expect(await vaultStrategyDS.connect(governer).withdrawQueue(vaultMock.address)).deep.equal([strategyB.address]);
  });

  it("should be able to migrate a strategy", async function () {
    expect(vaultStrategyDS.connect(governer).migrateStrategy(vaultMock.address, strategyA.address, addr0)).to.be.revertedWith(
      "invalid new strategy"
    );
    expect(vaultStrategyDS.connect(governer).migrateStrategy(vaultMock.address, strategyA.address, strategyA.address)).to.be.revertedWith(
      "new strategy already exists"
    );
    expect(vaultStrategyDS.migrateStrategy(vaultMock.address, strategyA.address, strategyB.address)).to.be.revertedWith("governance only");
    expect(await vaultStrategyDS.connect(governer).migrateStrategy(vaultMock.address, strategyA.address, strategyB.address))
      .to.emit(vaultStrategyDS, "StrategyMigrated")
      .withArgs(vaultMock.address, strategyA.address, strategyB.address);
    // Check that the strategy params are migrated
    expect(await vaultStrategyDS.strategyDebtRatio(vaultMock.address, strategyA.address)).to.equal(0);
    expect(await vaultStrategyDS.strategyDebtRatio(vaultMock.address, strategyB.address)).to.equal(debtRatio);
  });

  it("should be able to revoke a strategy", async function () {
    expect(await vaultStrategyDS.connect(governer).revokeStrategy(vaultMock.address, strategyA.address)).to.emit(
      vaultStrategyDS,
      "StrategyRevoked"
    );
  });

  it("should be able to revoke a strategy by strategy", async function () {
    const vault = await impersonate(vaultMock.address);
    expect(await vaultStrategyDS.connect(vault).revokeStrategyByStrategy(strategyA.address)).to.emit(vaultStrategyDS, "StrategyRevoked");
  });
});
