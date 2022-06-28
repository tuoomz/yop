// This script will generate a multisend transaction in the Gnosis Safe to execute pause/unpause functions on multiple pauseable contracts in a single transaction.
// By default, it will use the gatekeeper safe (0x5B6394Eb0C9Ac102fA5777D32Cd87151E894A940) to pause the contracts,
// and the governance safe (0x457a60065050050B3e64Fcd96cFb973123D38338) to unpause
// example:
// HARDHAT_NETWORK=rinkeby ./node_modules/.bin/ts-node \
//    --files ./scripts/pause.ts \
//    --contracts 0xb0Fa60dC63De31F8532565FCe956eA79A257D0ca
import yargs from "yargs/yargs";
import hre from "hardhat";
import { ContractFunctionCall } from "./lib/ContractDeployment";
import PauseableABI from "../abi/contracts/security/BasePauseableUpgradeable.sol/BasePauseableUpgradeable.json";
import { proposeTxns } from "./gnosis/propose-txn";

const GATEKEEPER_ADDRESS = "0x5B6394Eb0C9Ac102fA5777D32Cd87151E894A940";
const GOVERNANCE_ADDRESS = "0x457a60065050050B3e64Fcd96cFb973123D38338";

const argv = yargs(process.argv.slice(2))
  .options({
    contracts: { type: "string", array: true, describe: "An array of pauseable contract addresses to call, separated by spaces." },
    pause: {
      type: "boolean",
      default: "true",
    },
    gatekeeper: {
      type: "string",
      describe: "The address of the Gatekeeper Gnosis safe to generate the transaction.",
      default: GATEKEEPER_ADDRESS,
    },
    governance: {
      type: "string",
      describe: "The address of the Governance Gnosis safe to generate the transaction.",
      default: GOVERNANCE_ADDRESS,
    },
  })
  .parseSync();

async function main() {
  const contracts = argv.contracts;
  if (!contracts || contracts.length === 0) {
    throw new Error("no contracts");
  }
  const isPause = argv.pause;
  const safeAddress = isPause ? argv.gatekeeper : argv.governance;
  if (!safeAddress) {
    throw new Error("no safe address");
  }
  const calls: ContractFunctionCall[] = [];
  for (const s of contracts) {
    console.log(`Will call ${isPause ? "Pause" : "Unpause"} function on contract ${s}`);
    calls.push({
      abi: PauseableABI,
      address: s as string,
      methodName: isPause ? "pause" : "unpause",
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
