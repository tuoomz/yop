import { task } from "hardhat/config";
import { proposeTxn } from "../../scripts/gnosis/propose-txn";

export default task("gnosis:propose-txn", "Propose a transaction to a gnosis safe")
  .addParam("safeAddress", "Gnosis safe address to propose txn to")
  .addParam("contractAddress", "Contract address to interact with")
  .addParam("contractMethod", "Method name for contract you wish to interact")
  .addOptionalParam("implementationAddress", "If using a proxy provide the implementation address", "")
  .addOptionalParam("contractParams", "Method params if needed. Review docs for examples", "")
  .setAction(async (taskArguments, hre) => {
    const safeAddress = taskArguments.safeAddress;
    const contractAddress = taskArguments.contractAddress;
    const contractMethod = taskArguments.contractMethod;
    const contractParams = taskArguments.contractParams;
    const implementationAddress = taskArguments.implementationAddress;

    try {
      const response = await proposeTxn(safeAddress, contractAddress, contractMethod, contractParams, implementationAddress, hre);
      if (response?.status === 201) {
        console.log(`
>>>>>> Transaction Proposed Successfully <<<<<<<<

Response: ${response?.statusText}
Payload: ${response?.config?.data}

Gnosis Safe UI URL: https://gnosis-safe.io/app/${safeAddress}/transactions/queue
        `);
      } else console.log(response);
    } catch (error) {
      console.log(`
        >>>>>> Transaction Proposal Failed <<<<<<<<
        
        Error: ${error}
        `);
    }
  });
