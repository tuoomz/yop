import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { CurveBtc, CurveERC20SinglePool, ERC20, SingleAssetVault, VaultStrategyDataStore } from "../../../types";
import { CONST } from "../../constants";
import { jumpForward, prepareUseAccount, reset, setupVault } from "../shared/setup";
import { expect } from "chai";
import ERC20ABI from "../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";

describe("MigrateStrategy [@skip-on-coverage]", async () => {
  let vault: SingleAssetVault;
  let vaultStrategyDataStore: VaultStrategyDataStore;
  let governance: SignerWithAddress;
  let proposer: SignerWithAddress;
  let developer: SignerWithAddress;
  let keeper: SignerWithAddress;
  let user: SignerWithAddress;
  let curveStrategy: CurveBtc;
  let curveStrategyV2: CurveERC20SinglePool;
  let wbtcContract: ERC20;
  const depositAmount = ethers.utils.parseUnits("10", CONST.TOKENS.WBTC.DECIMALS);
  const allocatedFund = ethers.utils.parseUnits("9", CONST.TOKENS.WBTC.DECIMALS); // 90% ratio

  beforeEach(async () => {
    await reset(14255145);
    // setup the vault
    ({ vault, vaultStrategyDataStore, governance } = await setupVault(CONST.TOKENS.WBTC.ADDRESS));
    // deploy the strategy
    [proposer, developer, keeper, user] = (await ethers.getSigners()).reverse();
    const strategyFactory = await ethers.getContractFactory("CurveBtc");
    curveStrategy = (await strategyFactory.deploy(
      vault.address,
      proposer.address,
      developer.address,
      keeper.address,
      CONST.OBTC_ZAP.ADDRESS
    )) as CurveBtc;
    // add the strategy to the vault
    await vaultStrategyDataStore
      .connect(governance)
      .addStrategy(vault.address, curveStrategy.address, 9000, ethers.constants.Zero, ethers.constants.MaxUint256, 100);
    await vault.connect(governance).unpause();

    const strategyFactoryV2 = await ethers.getContractFactory("CurveERC20SinglePool");
    curveStrategyV2 = (await strategyFactoryV2.deploy(
      vault.address,
      proposer.address,
      developer.address,
      keeper.address,
      CONST.OBTC_ZAP.ADDRESS,
      CONST.OBTC_ZAP.GAUGE,
      CONST.OBTC_ZAP.NO_OF_COINS,
      CONST.OBTC_ZAP.COINS.WBTC,
      CONST.TOKENS.WBTC.ADDRESS,
      true
    )) as CurveERC20SinglePool;

    await prepareUseAccount(
      user,
      CONST.TOKENS.WBTC.ADDRESS,
      CONST.TOKENS.WBTC.WHALE,
      ethers.utils.parseUnits("10", CONST.TOKENS.WBTC.DECIMALS),
      vault.address,
      undefined,
      undefined
    );

    wbtcContract = (await ethers.getContractAt(ERC20ABI, CONST.TOKENS.WBTC.ADDRESS)) as ERC20;
  });

  it("will migrate all the funds in the strategy", async () => {
    await vault.connect(user).deposit(depositAmount, user.address);
    await curveStrategy.connect(governance).harvest();
    let strategyInfo = await vault.strategy(curveStrategy.address);
    expect(strategyInfo.totalDebt).to.equal(allocatedFund);
    expect(strategyInfo.lastReport).to.gt(0);
    expect(strategyInfo.activation).to.gt(0);
    jumpForward(24 * 60 * 60);
    expect(await wbtcContract.balanceOf(curveStrategyV2.address)).to.equal(0);
    await expect(await vaultStrategyDataStore.connect(governance).migrateStrategy(vault.address, curveStrategy.address, curveStrategyV2.address))
      .to.emit(vault, "StrategyMigrated")
      .withArgs(curveStrategy.address, curveStrategyV2.address);
    const balance = await wbtcContract.balanceOf(curveStrategyV2.address);
    expect(balance.toNumber()).to.be.closeTo(allocatedFund.toNumber(), 10 ** 7);
    const newStrategyInfo = await vault.strategy(curveStrategyV2.address);
    expect(newStrategyInfo.totalDebt).to.equal(strategyInfo.totalDebt);
    expect(newStrategyInfo.lastReport).to.equal(strategyInfo.lastReport);
    expect(newStrategyInfo.activation).to.equal(strategyInfo.activation);
    expect(newStrategyInfo.totalGain).to.equal(0);
    expect(newStrategyInfo.totalLoss).to.equal(0);
    strategyInfo = await vault.strategy(curveStrategy.address);
    expect(strategyInfo.totalDebt).to.equal(0);
    expect(await vaultStrategyDataStore.strategyDebtRatio(vault.address, curveStrategy.address)).to.equal(0);
    expect(await vaultStrategyDataStore.strategyDebtRatio(vault.address, curveStrategyV2.address)).to.equal(9000);
    expect(await vaultStrategyDataStore.strategyPerformanceFee(vault.address, curveStrategyV2.address)).to.equal(100);
    expect(await vaultStrategyDataStore.strategyMinDebtPerHarvest(vault.address, curveStrategyV2.address)).to.equal(0);
    expect(await vaultStrategyDataStore.strategyMaxDebtPerHarvest(vault.address, curveStrategyV2.address)).to.equal(ethers.constants.MaxUint256);
    expect(await vaultStrategyDataStore.vaultTotalDebtRatio(vault.address)).to.equal(9000);
    expect(await vaultStrategyDataStore.vaultStrategies(vault.address)).to.deep.equal([curveStrategyV2.address]);
    expect(await vaultStrategyDataStore.withdrawQueue(vault.address)).to.deep.equal([curveStrategyV2.address]);
  });
});
