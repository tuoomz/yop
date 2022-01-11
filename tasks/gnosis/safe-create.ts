import { task } from "hardhat/config";
import { createSafe } from "../../scripts/gnosis/safe-create";

export default task("gnosis:create-safe", "Comma separated list of safe owners")
  .addParam("owners", "Comma separated list of safe owners addresses")
  .addParam("threshold", "No. of confirmations a transaction needs before it can be executed")
  .addParam("privatekey", "Signer wallet used to create the safe and pay the transaction fees")
  .setAction(async (taskArguments, hre) => {
    const safeOwners = taskArguments.owners.split(",");
    const threshold = taskArguments.threshold;
    const privatekey = taskArguments.privatekey;

    try {
      const safe = await createSafe(safeOwners, threshold, privatekey, hre);

      console.log(`
>>>>>> Safe Created  <<<<<<<<
Safe Address: ${safe.getAddress()}
Owners: ${await safe.getOwners()}
Threshold: ${await safe.getThreshold()}

By Default, the safe won't load in the gnosis UI unless you are an owner. You will need to add it manually using the safe address above. Visit https://gnosis-safe.io/app/load to do this.
`);
    } catch (error) {
      console.log(`
            >>>>>> Safe Creation Failed <<<<<<<<

            Error: ${error}
            `);
    }
  });
