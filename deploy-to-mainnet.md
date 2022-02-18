# Deploy Smart Contracts to the Mainnet

## Prerequisites

- Checkout the [yop-protocol-evm](https://github.com/plutodigital/yop-protocol-evm) repo to run the deployment script.
- Have [hardhat](https://hardhat.org/) installed.
- Setup the AWS KMS id. For the details of how to do that, check [this document](https://github.com/plutodigital/yop-engineering-docs/blob/main/deploy/AWS_KMS.md).
- Have a valid etherscan API key (needed to verify the deployed contracts). If you don't have one, follow [this link](https://info.etherscan.com/etherscan-developer-api-key/).
- Have a valid Alchemy API key (needed by the deployment script). If you don't have one, you can use the shared Alchemy account (can be found in Keeper) and get a new API key.

## Steps

1.  Go to `yop-protocol-evm` directory and create a new `.env` file or update the existing one. It needs to have the following env vars defined:
    ```
    ETHERSCAN_API_KEY=<API Key here>
    ALCHEMY_API_KEY=<API Key here>
    AWS_REGION=eu-west-1
    GNOSIS_SIGNER_KMSID=<Put the AWS KMS deployer key id here>
    # This is needed to pass some checks. You can use the same value as GNOSIS_SIGNER_KMSID
    TESTNET_SIGNER_KMSID=<AWS KMS deployer key id>
    ```
    If you don't have AWS account setup locally, follow the [AWS CLI configuration guide](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html) to setup the AWS account.
1.  Check the [mainnet deployment configuration file](./deployment-config/mainnet-production.yaml) to make sure everything is correct. Especially check the contract addresses and make sure they are valid addresses in mainnet.
1.  Try the deployment to a local mainnet fork first to make sure the configuration are working as expected.

    - Go to the `yop-protocol-evm` directory, and run `npm run start-fork`. This will start a new Hardhat net locally that is forked from the mainnet. Wait for the node to be started.
    - In another terminal window, go to the `yop-protocol-evm` directory and run:

      ```
      # This will do a dry-run and print out all the contracts that will be deployed
      HARDHAT_NETWORK=localhost ./node_modules/.bin/ts-node --files ./scripts/deploy-by-config.ts --config ./deployment-config/mainnet-production.yaml --deploy true --update false --dryrun true  --env localhost-production
      ```

      To know more about the parameters, check the [documentation](https://github.com/plutodigital/yop-protocol-evm/blob/main/scripts/README.md#deploy-smart-contracts).

      This command should work and print out the contracts that need to be deployed. If there is any error, then they needs to be investigated and fixed.

      If you want to get a rough idea about the total gas cost of the deployment, get the current gas price from [Etherscan](https://etherscan.io/gastracker), and set it as an env var (in GWEI):

      ```
      export GAS_PRICE=80
      ```

      Next we can try deploy the contract locally:

      ```
      HARDHAT_NETWORK=localhost ./node_modules/.bin/ts-node --files ./scripts/deploy-by-config.ts --config ./deployment-config/mainnet-production.yaml --deploy true --update false --dryrun false  --env localhost-production
      ```

      It will print out information for each contract deployment, and abort if there is an error. If there is no error, it will print out the total gas cost at the end (in ETH), and that will give you an idea of how much ETH you will need for the deployment to mainnet.

      If the deployment is failed for whatever reason, you should investigate the issue and fix it, and try deploy again. However, there maybe files created and stored locally from previous runs, so you should clean them up if they exists:

          * check the `.openzeppelin` folder and remove the `unknown-31337.json` file if it exists
          * check the `deployments` folder and remove the `localhost-production.json` file if it exists

      If all the contracts are deployed successfully, run the next command to see how the function calls that will be made to configure the contract:

      ```
      HARDHAT_NETWORK=localhost ./node_modules/.bin/ts-node --files ./scripts/deploy-by-config.ts --config ./deployment-config/mainnet-production.yaml --deploy false --update true --dryrun true  --env localhost-production
      ```

      This will print out information about all the contract calls that are needed to configure the contracts. Review these and make sure they are right. We are not going to run these as they will be created as a multisig transaction in the Gnosis safe. We don't want to do that for local testing.

1.  After the deployment is verified locally, we can proceed to deploy to the mainnet. Before progressing, check the deployer account that going to be used and make sure it has enough ETH for the deployment. Then run the following command:

    ```
    # Print out contract deployment information against mainnet, this command will only check contract deployments and is a dry run.
    HARDHAT_NETWORK=mainnet ./node_modules/.bin/ts-node --files ./scripts/deploy-by-config.ts --config ./deployment-config/mainnet-production.yaml --deploy true --update false --dryrun true  --env mainnet-production

    # Then deploy the contracts, but not configure the contracts.
    HARDHAT_NETWORK=mainnet ./node_modules/.bin/ts-node --files ./scripts/deploy-by-config.ts --config ./deployment-config/mainnet-production.yaml --deploy true --update false --dryrun false  --env mainnet-production

    # Check the configuration changes. Review the contract calls.
    HARDHAT_NETWORK=mainnet ./node_modules/.bin/ts-node --files ./scripts/deploy-by-config.ts --config ./deployment-config/mainnet-production.yaml --deploy false --update true --dryrun true  --env mainnet-production

    # Apply the configuration changes. For mainnet deployment, the governance wallet is needed to sign these transactions, and it is a multisig wallet. So the script will propose all the contract calls as a single transaction to the governance multisig wallet, and then the approvers of the wallet can review, approve and execute the transaction.
    HARDHAT_NETWORK=mainnet ./node_modules/.bin/ts-node --files ./scripts/deploy-by-config.ts --config ./deployment-config/mainnet-production.yaml --deploy false --update true --dryrun false  --env mainnet-production
    ```

    The last command will propose a new transaction in the governance's multisig safe. It's a single contract call that contains all the transaction that are needed for configuring all the contracts. If you are one of the approvers of that multisig wallet, you can review the call details via the Gnosis UI and approve to execute the transaction.

1.  Next we need to upload Etherscan the verify the contracts we have deployed. Again in the `yop-protocol-evm` directory, run the following command:
    ```
    HARDHAT_NETWORK=mainnet ./node_modules/.bin/ts-node --files ./scripts/verify.ts --env mainnet-production
    ```
    It will take a while to upload the source code to Etherscan and get them verified. While this is being progressed, you can progress to the next step and leave this running.
1.  An additional one-time step is required to approve the rewards contract as the spender of the rewards wallet. This is needed because when users claim their YOP rewards, the reward contract will just transfer YOP tokens from the rewards wallet to the user directly. In order for the rewards contract to do this step, the approval is needed. To do this:
    - Get the deployed address of the rewards contract (you can find it in the `deployments/mainnet-production.json` file).
    - If the rewards wallet is a multisig, use the Gnosis UI to call the `approve` function on the [YOP token contract](https://etherscan.io/token/0xae1eaae3f627aaca434127644371b67b18444051). Set the reward contract address as the `spender` and set the large value for the limit (e.g. 2400000000000000 - 24 million YOPs).
    - If the rewards wallet is just a normal wallet, then you need to contact the wallet owner to do this via Etherscan.
1.  The contract deployment is done at this point. We then need to copy the generated deployment file to the YOP Dapp so it will be used. Find the `deployments/mainnet-production.json` file and copy it to [this directory of the YOP DAPP repo](https://github.com/plutodigital/yop-dapp/tree/main/app_constants/yop-deployments), and uncomment [this code](https://github.com/plutodigital/yop-dapp/blob/main/app_constants/yop-deploy-config.ts#L121-L124) to load the deployment file.
1.  Commit the new files generated for the production deployment and push them to upstream. Especially there should be a new file generated in the `.openzeppelin` folder and it should be committed too.
