import { task } from "hardhat/config";
import { time } from "@nomicfoundation/hardhat-network-helpers";
export default task("fork:increase-time", "increase time one month").setAction(async (taskArguments, hre) => {
  console.log("Increase time Fork");

  const ONE_MONTH_IN_SECS = 60 * 60 * 24 * 32;

  await time.increase(ONE_MONTH_IN_SECS);

  console.log("Finished!");
});
