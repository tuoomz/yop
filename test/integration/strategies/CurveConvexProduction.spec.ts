// The tests here will run against the latest deployed contracts on mainnet using fork
// to allow us quickly check if there will be an issue with deploying and using a particular Curve/Context pool

import { expect } from "chai";
import { impersonate, reset } from "../shared/setup";
import { ethers } from "hardhat";

import { VaultStrategyDataStore } from "../../../types/VaultStrategyDataStore";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BaseStrategy } from "../../../types";
import { CONST } from "../../constants";
import VaultABI from "../../../abi/contracts/vaults/SingleAssetVaultV2.sol/SingleAssetVaultV2.json";
import MainnetDeployments from "../../../deployments/mainnet-production.json";
import { SingleAssetVaultV2 } from "../../../types/SingleAssetVaultV2";
import VaultStrategyDataStoreABI from "../../../abi/contracts/vaults/VaultStrategyDataStore.sol/VaultStrategyDataStore.json";

// v2 contracts are deployed after 14710071, so should use a block number is that at least larger than it
const FORK_BLOCK = 14742035;
const HARVESTER_ADDRESS = "0xE9CDD67b924a8e82709207373699bb749F8851CE";

interface StrategyInfo {
  vault: string;
  name: string;
  contract: string;
  params: string[];
  // set this if it is a new strategy and there still room to set the debt ratio
  // use BPS e.g. 100 means 1%
  allocation?: number;
  // set this if an existing strategy will be migrated to the new one
  migrateFrom?: string;
  // set this if an existing strategy needs to be revoked
  // and then adding the new one
  revoke?: string;
  // block to fork from for the test
  forkBlock?: number;
}

const strategies: StrategyInfo[] = [
  {
    name: "ETH-Convex",
    vault: MainnetDeployments["Ethereum Genesis"].address,
    contract: "ConvexETHSinglePool",
    params: [
      MainnetDeployments["Ethereum Genesis"].address,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      HARVESTER_ADDRESS,
      CONST.ST_ETH_POOL.ADDRESS,
      CONST.ST_ETH_POOL.GAUGE,
      CONST.ST_ETH_POOL.COINS.ETH,
      25,
      CONST.CONVEX_BOOSTER_ADDRESS,
      CONST.TOKENS.LDO.ADDRESS,
    ],
    migrateFrom: MainnetDeployments.ConvexETH.address,
    forkBlock: 14742035,
  },
  {
    name: "USDC-ConvexFrax",
    vault: MainnetDeployments["USDC Genesis"].address,
    contract: "ConvexCurveMeta",
    params: [
      MainnetDeployments["USDC Genesis"].address,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      HARVESTER_ADDRESS,
      CONST.THREE_POOL.ADDRESS,
      CONST.THREE_POOL.LP_TOKEN,
      CONST.FRAX_META_POOL.ADDRESS,
      CONST.FRAX_META_POOL.LP_TOKEN,
      CONST.THREE_POOL.COINS.USDC,
      CONST.THREE_POOL.NO_OF_COINS,
      CONST.CONVEX_BOOSTER_ADDRESS,
      32,
    ],
    allocation: 5000, // 50%
    forkBlock: 14742035,
  },
  {
    name: "DAI-ConvexFrax",
    vault: MainnetDeployments["DAI Genesis"].address,
    contract: "ConvexCurveMeta",
    params: [
      MainnetDeployments["DAI Genesis"].address,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      HARVESTER_ADDRESS,
      CONST.THREE_POOL.ADDRESS,
      CONST.THREE_POOL.LP_TOKEN,
      CONST.FRAX_META_POOL.ADDRESS,
      CONST.FRAX_META_POOL.LP_TOKEN,
      CONST.THREE_POOL.COINS.DAI,
      CONST.THREE_POOL.NO_OF_COINS,
      CONST.CONVEX_BOOSTER_ADDRESS,
      32,
    ],
    revoke: MainnetDeployments.ConvexDAI.address,
    forkBlock: 14742035,
  },
  {
    name: "USDT-ConvexFrax",
    vault: MainnetDeployments["USDT Genesis"].address,
    contract: "ConvexCurveMeta",
    params: [
      MainnetDeployments["USDT Genesis"].address,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      HARVESTER_ADDRESS,
      CONST.THREE_POOL.ADDRESS,
      CONST.THREE_POOL.LP_TOKEN,
      CONST.FRAX_META_POOL.ADDRESS,
      CONST.FRAX_META_POOL.LP_TOKEN,
      CONST.THREE_POOL.COINS.USDT,
      CONST.THREE_POOL.NO_OF_COINS,
      CONST.CONVEX_BOOSTER_ADDRESS,
      32,
    ],
    revoke: MainnetDeployments.ConvexUSDT.address,
    forkBlock: 14742035,
  },
  {
    name: "WBTC-ConvexsBTC",
    vault: MainnetDeployments["Bitcoin Genesis"].address,
    contract: "ConvexERC20SinglePool",
    params: [
      MainnetDeployments["Bitcoin Genesis"].address,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      HARVESTER_ADDRESS,
      CONST.SBTC.ADDRESS,
      CONST.SBTC.GAUGE,
      CONST.SBTC.NO_OF_COINS,
      CONST.SBTC.COINS.WBTC,
      CONST.TOKENS.WBTC.ADDRESS,
      false,
      7,
      CONST.CONVEX_BOOSTER_ADDRESS,
    ],
    migrateFrom: MainnetDeployments.ConvexWBTC.address,
  },
];

strategies.forEach(function (strategyInfo) {
  describe("Test for strategy: " + strategyInfo.name + " [@skip-on-coverage]", async () => {
    let vault: SingleAssetVaultV2;
    let vaultStrategyDataStore: VaultStrategyDataStore;
    let strategy: BaseStrategy;
    let governance: SignerWithAddress;
    let harvester: SignerWithAddress;

    beforeEach(async () => {
      await reset(strategyInfo.forkBlock || FORK_BLOCK);
      // setup the vault
      vault = (await ethers.getContractAt(VaultABI, strategyInfo.vault)) as SingleAssetVaultV2;
      const strategyDataStoreAddress = await vault.strategyDataStore();
      const governanceAddress = await vault.governance();
      governance = await impersonate(governanceAddress);
      vaultStrategyDataStore = (await ethers.getContractAt(VaultStrategyDataStoreABI, strategyDataStoreAddress)) as VaultStrategyDataStore;
      harvester = await impersonate(HARVESTER_ADDRESS);
      const StrategyFactory = await ethers.getContractFactory(strategyInfo.contract);
      strategy = (await StrategyFactory.deploy(...strategyInfo.params)) as BaseStrategy;
      if (strategyInfo.allocation) {
        // add the strategy to the vault
        await vaultStrategyDataStore
          .connect(governance)
          .addStrategy(vault.address, strategy.address, strategyInfo.allocation, ethers.constants.Zero, ethers.constants.MaxUint256, 100);
      } else if (strategyInfo.migrateFrom) {
        await vaultStrategyDataStore.connect(governance).migrateStrategy(vault.address, strategyInfo.migrateFrom, strategy.address);
      } else if (strategyInfo.revoke) {
        const currentDebtRatio = await vaultStrategyDataStore.strategyDebtRatio(vault.address, strategyInfo.revoke);
        // revoke the old one
        await vaultStrategyDataStore.connect(governance).revokeStrategy(vault.address, strategyInfo.revoke);
        // add the new strategy
        await vaultStrategyDataStore
          .connect(governance)
          .addStrategy(vault.address, strategy.address, currentDebtRatio, ethers.constants.Zero, ethers.constants.MaxUint256, 100);
      }
    });

    describe("Happy path", async () => {
      it("normal operation", async () => {
        await strategy.connect(harvester).harvest();
        expect(await strategy.estimatedTotalAssets()).to.gt(0);
      });

      it("emergency withdraw", async () => {
        await strategy.connect(harvester).harvest();
        await strategy.connect(governance).setEmergencyExit();
        await strategy.connect(harvester).harvest();
      });
    });
  });
});
