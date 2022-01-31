## Deploy Smart Contracts

To deploy the smart contracts and set things up, the best thing to do is to use the [`deploy-by-config.ts`](./deploy-by-config.ts) script.

In order to use the script, you will need to create a YAML file to describe the complete setup. An [example configuration](../deployment-config/config-example.yaml) is available. You should copy it and make changes as required. At the moment, that example file uses address/tokens from the mainnet, so you should deploy the contracts on a fork of the mainnet.

In one terminal window, run:

```
npm run start-fork
```

and wait for the fork to start.

Then in another terminal window, run:

```
# print out the contracts that will be deployed
HARDHAT_NETWORK=localhost ./node_modules/.bin/ts-node --files ./scripts/deploy-by-config.ts --config ./deployment-config/config-example.yaml --deploy true --update false --dryrun true  --env dev
# deploy the contracts
HARDHAT_NETWORK=localhost ./node_modules/.bin/ts-node --files ./scripts/deploy-by-config.ts --config ./deployment-config/config-example.yaml --deploy true --update false --dryrun false  --env dev

# print out the contract calls that going to be made
HARDHAT_NETWORK=localhost ./node_modules/.bin/ts-node --files ./scripts/deploy-by-config.ts --config ./deployment-config/config-example.yaml --deploy true --update true --dryrun true  --env dev
# configure the contracts
HARDHAT_NETWORK=localhost ./node_modules/.bin/ts-node --files ./scripts/deploy-by-config.ts --config ./deployment-config/config-example.yaml --deploy true --update true --dryrun false  --env dev
```

For the arguments:

- config: The path to the configuration file
- deploy: Set this to true to deploy new smart contracts. The results of the deployments will be stored in a configuration file that is named with the value of the `env` argument, and if a contract is already deployed the script will skip the already deployed contracts. Default value is true.
- update: Set this to true if you want to configure the deployed contracts to match the state described in the YAML file. Should only run this after all contracts are deployed. If there are contracts not deployed there could be errors. Default value is true.
- dryrun: If set to true, the script will only print out information, like the contracts that will be deployed, or the smart contract calls that will be made, with estimated gas if available (they are not available for proxy contracts or multisig transactions). If this set to false the script will actually execute the transactions.
- env: The name of the environment. A deployment records file will be created using this value.
