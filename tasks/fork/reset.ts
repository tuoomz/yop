import { task } from "hardhat/config";

export default task("fork:reset", "reset fork").setAction(async (taskArguments, hre) => {
  console.log("Reset Fork");

  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: hre.config.networks.hardhat.forking?.url,
          blockNumber: hre.config.networks.hardhat.forking?.blockNumber,
        },
      },
    ],
  });

  console.log("Finished!");
});
