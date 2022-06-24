// This script will generate a multisend transaction in the Gnosis Safe to execute harvest functions on multiple strategies in a single transaction.
// example:
// HARDHAT_NETWORK=rinkeby ./node_modules/.bin/ts-node --files ./scripts/harvest.ts \
//    --strategies 0x6CF01477dc80f1Cee8A24E9E69e619b9129DCdD4 0x92Dd7d2EB80775388005b4Fc9ac7642aB6462a4b \
//    --safe 0x02319D11BAe6b7027efbfED51163a8c51ec3d6FA
import yargs from "yargs/yargs";
import hre from "hardhat";
import { ContractFunctionCall } from "./lib/ContractDeployment";
import StrategyABI from "../abi/contracts/strategies/BaseStrategy.sol/BaseStrategy.json";
import { proposeTxns } from "./gnosis/propose-txn";

const HARVESTER_ADDRESS = "0xE9CDD67b924a8e82709207373699bb749F8851CE";

const argv = yargs(process.argv.slice(2))
  .options({
    strategies: { type: "string", array: true, describe: "An array of strategy addresses to call harvest, separated by spaces." },
    safe: {
      type: "string",
      describe: "The address of the Gnosis safe to generate the transaction. Default to the harvester safe",
      default: HARVESTER_ADDRESS,
    },
  })
  .parseSync();

async function main() {
  const strategies = argv.strategies;
  if (!strategies || strategies.length === 0) {
    throw new Error("no strategies");
  }
  const safeAddress = argv.safe || HARVESTER_ADDRESS;
  if (!safeAddress) {
    throw new Error("no safe address");
  }
  const calls: ContractFunctionCall[] = [];
  for (const s of strategies) {
    console.log(`Will call harvest function on strategy ${s}`);
    calls.push({
      abi: StrategyABI,
      address: s as string,
      methodName: "harvest",
      params: [],
      signer: {
        address: safeAddress,
        safe: safeAddress,
        type: "multisig",
      },
    });
  }
  await proposeTxns(safeAddress, calls, hre);
  console.log(`Transaction proposed to Gnosis Safe ${safeAddress}. Please confirm and execute the transaction using Gnosis Safe`);
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
