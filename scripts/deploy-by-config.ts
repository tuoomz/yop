import yargs from "yargs/yargs";
import { load } from "js-yaml";
import { readFileSync } from "fs";
import { ContractDeploymentCall, ContractDeploymentUpdate, ContractFunctionCall } from "./lib/ContractDeployment";
import { AccessControlManagerDeployment } from "./lib/AccessControlManagerDeployment";
import { Executor } from "./lib/Executor";
import path from "path";
import { VaultStrategyDataStoreDeployment } from "./lib/VaultStrategyDataStoreDeployment";
import { FeeCollectionDeployment } from "./lib/FeeCollectionDeployment";
import { YopRewardDeployment } from "./lib/YopRewardDeployment";
import { StakingDeployment } from "./lib/StakingDeployment";
import { VaultDeployment } from "./lib/VaultDeployment";
import { YopRegistryDeployment } from "./lib/YopRegistryDeployment";
import { YOPRouterDeployment } from "./lib/YopRouterDeployment";

const argv = yargs(process.argv.slice(2))
  .options({
    config: { type: "string", default: "", describe: "the path to the configuration YAML file" },
    deploy: { type: "boolean", default: true, describe: "set to true to deploy new contracts" },
    update: { type: "boolean", default: true, describe: "set to true to configure the deployed contracts" },
    dryrun: { type: "boolean", default: true, describe: "set to true to only print out the changes without executing them" },
    env: { type: "string", default: "", describe: "the environment id" },
  })
  .parseSync();

async function main() {
  const configFile = argv.config;
  if (!configFile) {
    throw new Error("no config file found");
  }
  const env = argv.env;
  if (!env) {
    throw new Error("no environment found");
  }
  console.log(`Run deployment script using config file ${configFile} and environment name ${env}`);
  const fileContent = readFileSync(configFile, { encoding: "utf-8" });
  const parsed = load(fileContent) as any;
  const commonArgs = {
    env: env,
    dryrun: argv.dryrun,
  };
  const deployments: ContractDeploymentUpdate[] = [];
  let deploymentsCalls = new Array<ContractDeploymentCall>();
  let updateCalls = new Array<ContractFunctionCall>();
  if (parsed.access_control) {
    deployments.push(new AccessControlManagerDeployment(commonArgs, parsed.access_control));
  }
  const vaultStrategyDataStoreDeployment = new VaultStrategyDataStoreDeployment(commonArgs, parsed.vault_strategy_data_store);
  deployments.push(vaultStrategyDataStoreDeployment);
  if (parsed.fee_collection) {
    deployments.push(new FeeCollectionDeployment(commonArgs, parsed.fee_collection));
  }
  if (parsed.rewards) {
    deployments.push(new YopRewardDeployment(commonArgs, parsed.rewards));
  }
  if (parsed.staking) {
    deployments.push(new StakingDeployment(commonArgs, parsed.staking));
  }
  const vaultNames: Array<string> = [];
  if (parsed.vaults) {
    for (let i = 0; i < parsed.vaults.length; i++) {
      vaultNames.push(parsed.vaults[i].name);
      parsed.vaults[i].version = parsed.vault_version;
      deployments.push(new VaultDeployment(commonArgs, parsed.vaults[i], vaultStrategyDataStoreDeployment));
    }
  }
  if (parsed.registry) {
    parsed.registry.vaultNames = vaultNames;
    deployments.push(new YopRegistryDeployment(commonArgs, parsed.registry));
  }
  if (parsed.router) {
    deployments.push(new YOPRouterDeployment(commonArgs, parsed.router));
  }
  for (const d of deployments) {
    if (argv.deploy) {
      deploymentsCalls = deploymentsCalls.concat(await d.deploy());
    }
    if (argv.update) {
      updateCalls = updateCalls.concat(await d.update());
    }
  }
  const executor = new Executor(env, argv.dryrun);
  if (deploymentsCalls.length > 0) {
    await executor.executeDeployments(deploymentsCalls);
  }
  if (updateCalls.length > 0) {
    await executor.executeFunctions(updateCalls);
  }
  console.log(`Execution completed. Records can be found in ${path.join("deployments", env + ".json")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
