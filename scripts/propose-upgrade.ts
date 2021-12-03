import path from "path";
import hre from "hardhat";
import { readDeploymentFile, writeDeploymentFile, verifyEnvVar } from "./util";
const requireEnvVar = ["ETHERSCAN_API_KEY", "ALCHEMY_API_KEY", "CURRENT_CONTRACT_FACTORY_NAME", "NEW_CONTRACT_FACTORY_NAME"];
verifyEnvVar(requireEnvVar);
async function main(): Promise<void> {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  const currentContractName: any = process.env.CURRENT_CONTRACT_FACTORY_NAME;
  const newContractName: any = process.env.NEW_CONTRACT_FACTORY_NAME;
  const abiPath = path.join(__dirname, `../artifacts/contracts/vaults/${newContractName}.sol/${newContractName}.json`);

  console.log(`Deploying contracts as ${deployerAddress}`);

  let deployRecord = await readDeploymentFile();
  console.log(`Preparing ${newContractName} contract.`);

  const newFactory = await ethers.getContractFactory(newContractName);

  const currentContract = deployRecord[currentContractName].address;
  const upgrade = await hre.upgrades.prepareUpgrade(currentContract, newFactory);

  console.log(`Deployed new implementation contract ${newContractName} - address: ${upgrade}`);

  deployRecord = {
    ...deployRecord,
    [newContractName]: {
      address: currentContract, // proxy address
      implementationAddress: upgrade,
      proposedUpgrade: true,
    },
  };

  await writeDeploymentFile(deployRecord);

  console.log(`
      NOTE: Upgrade is not deployed. Just prepared. 
      Governance must now use the upgradeTo method to approve the upgrade with the new implementation address.

      Proxy address: ${currentContract}
      Implementation address to be approved: ${upgrade}

      Path to ABI needed for gnosis-safe (upgradeTo):
      ${abiPath}

  `);
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
