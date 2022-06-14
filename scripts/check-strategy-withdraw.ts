// This script can be used to check what the return will be when we withdraw everything from a strategy.
// This should be used against a local fork.
// It will check the balance of the vault first, then set the debt ratio of the stratgy to 0 and then call `harvest` on the strategy.
// It will then check the balance of the vault again and compute the difference between before and after.
import yargs from "yargs/yargs";
import { ethers } from "hardhat";
import VaultABI from "../abi/contracts/vaults/SingleAssetVaultV2.sol/SingleAssetVaultV2.json";
import { SingleAssetVaultV2 } from "../types/SingleAssetVaultV2";
import ERC20ABI from "../abi/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json";
import { ERC20 } from "../types/ERC20";
import { impersonate } from "./util";
import VaultStrategyDataStoreABI from "../abi/contracts/vaults/VaultStrategyDataStore.sol/VaultStrategyDataStore.json";
import { VaultStrategyDataStore } from "../types/VaultStrategyDataStore";
import StrategyABI from "../abi/contracts/strategies/BaseStrategy.sol/BaseStrategy.json";
import { BaseStrategy } from "../types/BaseStrategy";

const GovernanceAddress = "0x457a60065050050B3e64Fcd96cFb973123D38338";
const VaultStrategyDataStoreAddress = "0xA2B75cE4708f50EBf02Ceb142b359DEaD2144835";

const argv = yargs(process.argv.slice(2))
  .options({
    vault: { type: "string", describe: "vault address" },
    strategy: { type: "string", describe: "strategy address" },
    "no-fees": { type: "boolean", default: false, describe: "do no charge fees" },
  })
  .parseSync();

async function main() {
  const vaultAddress = argv.vault;
  if (!vaultAddress) {
    throw new Error("no vault address");
  }
  const strategyAddress = argv.strategy;
  if (!strategyAddress) {
    throw new Error("no strategy address");
  }
  const vault = (await ethers.getContractAt(VaultABI, vaultAddress)) as SingleAssetVaultV2;
  const tokenAddress = await vault.token();
  const token = (await ethers.getContractAt(ERC20ABI, tokenAddress)) as ERC20;
  const decimals = await vault.decimals();
  const vaultBalanceBefore = await token.balanceOf(vaultAddress);
  console.log(`Vault balance before harvesting strategy: ${ethers.utils.formatUnits(vaultBalanceBefore, decimals)}`);
  const vaultStrategyDataStore = (await ethers.getContractAt(
    VaultStrategyDataStoreABI,
    VaultStrategyDataStoreAddress
  )) as VaultStrategyDataStore;
  const strategyTotalDebt = (await vault.strategy(strategyAddress)).totalDebt;
  const governance = await impersonate(GovernanceAddress);
  await vaultStrategyDataStore.connect(governance).updateStrategyDebtRatio(vaultAddress, strategyAddress, ethers.constants.Zero);
  // do not charge fees
  if (argv["no-fees"]) {
    console.log("Set fees to 0");
    await vaultStrategyDataStore.connect(governance).updateStrategyPerformanceFee(vaultAddress, strategyAddress, 0);
    await vault.connect(governance).setManagementFee(0);
  }
  console.log(`Strategy debt ratio is set to 0`);
  const strategy = (await ethers.getContractAt(StrategyABI, strategyAddress)) as BaseStrategy;
  await strategy.connect(governance).harvest();
  console.log(`Strategy harvested`);
  const vaultBalanceAfter = await token.balanceOf(vaultAddress);
  console.log(`Vault balance after: ${ethers.utils.formatUnits(vaultBalanceAfter, decimals)}`);
  const diff = vaultBalanceAfter.sub(vaultBalanceBefore);
  console.log(`Total returned by the strategy: ${ethers.utils.formatUnits(diff, decimals)}`);
  console.log(`Strategy debt is: ${ethers.utils.formatUnits(strategyTotalDebt, decimals)}`);
  if (diff.gte(strategyTotalDebt)) {
    console.log(`Profit made by the strategy: ${ethers.utils.formatUnits(diff.sub(strategyTotalDebt), decimals)}`);
  } else {
    console.log(`Loss made by the strategy: ${ethers.utils.formatUnits(strategyTotalDebt.sub(diff), decimals)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
