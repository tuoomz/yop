# Contracts for Vaults & Strategies

## Prerequisites

- Nodejs LTS (v14). It is recommended to use [nvm](https://github.com/nvm-sh/nvm) to support multiple versions of nodejs locally.
- Solidity compiler v0.8.9
- It uses [hardhat](https://hardhat.org/), no need to install anything, just run `npm install .`

## Build

```
npx hardhat compile
```

```
npm run build
```

## Test

### Unit Tests

Run:

```
npm run test/unit
```

### Integration Tests

Prerequisites:

- [ALCHEMY_API_KEY](#Environment-Variables) env configured in the `.env` file or exported before executing the integration tests

Run:

```
npm run test/integration
```

### Print contracts logs

To print the contract logs to the console during the test execution you have to add the `--logs` flag like this:

```
npm run test/unit -- --logs
```

or using the hardhat cli directly:

```
npx hardhat test --logs
```

### Run Tests in VSCode

To run the tests in VSCode, install the [Mocha Test Explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-mocha-test-adapter) extension, and then update this VSCode option `mochaExplorer.files` to `test/**/*.{j,t}s`.

## Static Analysis

Static analysis is used to test contracts for possible issues and optimizations. This should be done in development and as part of PR review process.

### Slither

[crytic/slither](https://github.com/crytic/slither) the Solidity source analyzer
You will need to install it locally:

```bash
pip3 install slither-analyzer
```

If you dont have solidity installed locally - i.e. `solc` command is throwing `command not found` then you will need to install it with the following:

```bash
brew update
brew upgrade
brew tap ethereum/ethereum
brew install solidity
```

#### Testing

Run slither on all contracts:
`slither .`

Run slither on a single file:
`slither contracts/vaults/BaseVault.sol --solc-remaps @openzeppelin=/$(pwd)/node_modules/@openzeppelin`

You can use Slither printers to quickly report crucial contract information.
[crytic/slither#printers](https://github.com/crytic/slither#printers)
e.g.

```bash
❯ slither contracts/vaults/BaseVault.sol --solc-remaps @openzeppelin=/$(pwd)/node_modules/@openzeppelin --print human-summary

Compiled with solc
Number of lines: 2987 (+ 0 in dependencies, + 0 in tests)
Number of assembly lines: 0
Number of contracts: 27 (+ 0 in dependencies, + 0 tests)

Number of optimization issues: 16
Number of informational issues: 142
Number of low issues: 16
Number of medium issues: 2
Number of high issues: 0

ERCs: ERC20

+------------------------+-------------+-------+--------------------+--------------+--------------------+
|          Name          | # functions |  ERCS |     ERC20 info     | Complex code |      Features      |
+------------------------+-------------+-------+--------------------+--------------+--------------------+
|        Ownable         |      7      |       |                    |      No      |                    |
|        Pausable        |      6      |       |                    |      No      |                    |
|       SafeERC20        |      6      |       |                    |      No      |      Send ETH      |
|                        |             |       |                    |              | Tokens interaction |
|        Address         |      11     |       |                    |      No      |      Send ETH      |
|                        |             |       |                    |              |    Delegatecall    |
|                        |             |       |                    |              |      Assembly      |
|        Counters        |      4      |       |                    |      No      |                    |
|         ECDSA          |      9      |       |                    |      No      |     Ecrecover      |
|                        |             |       |                    |              |      Assembly      |
|        SafeMath        |      13     |       |                    |      No      |                    |
|     EnumerableSet      |      24     |       |                    |      No      |      Assembly      |
|  AccessControlManager  |      5      |       |                    |      No      |                    |
| AllowlistAccessControl |      9      |       |                    |      No      |                    |
|       IStrategy        |      22     |       |                    |      No      |                    |
|       BaseVault        |     113     | ERC20 |     No Minting     |     Yes      | Tokens interaction |
|                        |             |       | Approve Race Cond. |              |                    |
|                        |             |       |                    |              |                    |
+------------------------+-------------+-------+--------------------+--------------+--------------------+
contracts/vaults/BaseVault.sol analyzed (27 contracts)
```

## Deploy

Before you can deploy you need to have a populated `.env` file in the root of this project using `.env.example` as an example.

### Local Mainnet Fork

**Prerequisites:**

- [ALCHEMY_API_KEY](#Environment-Variables) env

Start a fork of the mainnet locally with hardhat:

> The default forked block is configured in the [hardhat.config.ts](./hardhat.config.ts) config file and can be manually changed by setting the [FORK_BLOCK_NUMBER](#Environment-Variables) env.

> Learn more about Mainnet forking here: https://hardhat.org/hardhat-network/guides/mainnet-forking.html

```
npm run start-fork
```

In a new terminal window/tab copy the network configuration files:

> If you don't copy the `mainnet-production.json` file all contracts will be deployed as new contracts and not as upgrades of the existing ones in the fork network.

```
cp ./deployments/mainnet-production.json ./deployments/dev.json
cp ./.openzeppelin/mainnet.json ./.openzeppelin/unknown-31337.json
```

Deploy the contracts:

> The `deploy-by-config.ts` script with the `--deploy true` flag will deploy all contracts with the configuration specified from the `./deployment-config/mainnet-production.yaml` config file to the localhost forked network and will use the `./deployments/dev.json` file to determinate contract by contract if it has to be deployed, or it is already up-to-date and will then update the `./deployments/dev.json` file to match the new status of the contracts.

```
HARDHAT_NETWORK=localhost ./node_modules/.bin/ts-node --files ./scripts/deploy-by-config.ts --config ./deployment-config/mainnet-production.yaml --deploy true --update false --dryrun false --env dev
```

Update the contracts configuration:

> Part of the configuration defined in the `mainnet-production.yaml` config file is set in this step and can be changed by executing this step again

```
HARDHAT_NETWORK=localhost ./node_modules/.bin/ts-node --files ./scripts/deploy-by-config.ts --config ./deployment-config/mainnet-production.yaml --deploy false --update true --dryrun false --env dev
```

The fork network is now ready to be tested.

#### Reset Local Mainnet Fork

```bash
npm run reset-fork
```

#### Get ETH, DAI, USDC, YOP, ... tokens

To be able to test deposit, withdraw, boost and staking you need funds in different tokens. And because you may not have an account in the mainnet with a lot of funds you can add them to the forked mainnet with the `npm run populate-fork` command.

To start you need to set the [DEVELOPMENT_WALLET](#Environment-Variables) env to your development account address which will receive the funds.

Then run the following cmd to add ETH, DAI, USDC, YOP, ... to your development account.

```
npm run populate-fork
```

> Note: Tokens are not minted but tranfered from existing accounts defined in [accounts.ts](./tasks/fork/accounts.ts) file, therfore depending on status of the mainnet and the forked block number one or more accounts may not have the required funds and the **populate-fork** cmd could fail.

### Deploy To Mainnet Fork

See [deployment by config](./scripts/README.md#deploy-smart-contracts).

#### More Coming Soon

### Upgrade

See [upgrade instructions](./scripts/README.md#upgrade-smart-contracts).

## Other available commands

```bash
npx hardhat accounts
npx hardhat clean
npx hardhat node
npx hardhat help
REPORT_GAS=true npx hardhat test
npx hardhat coverage
npx hardhat run scripts/deploy-all.ts
npx hardhat size-contracts
TS_NODE_FILES=true npx ts-node scripts/deploy-all.ts
npx eslint '**/*.{js,ts}'
npx eslint '**/*.{js,ts}' --fix
npx prettier '**/*.{json,sol,md}' --check
npx prettier '**/*.{json,sol,md}' --write
npx solhint 'contracts/**/*.sol'
npx solhint 'contracts/**/*.sol' --fix
```

For more information, please checkout [Hardhat docs](https://hardhat.org/getting-started/).

## Environment Variables

Many cmds can be tweaked using environment variables, they can be set in the `.env` file in the project root, and for starting you can the `.env.example` file.

```
cp .env.example .env
```

| Name                 | Description                                                                                                             | Default Value |
| -------------------- | :---------------------------------------------------------------------------------------------------------------------- | ------------: |
| `ALCHEMY_API_KEY`    | The Alchemy API key is personal and can be optained by creating an account at https://alchemyapi.io                     |               |
| `FORK_BLOCK_NUMBER`  | The block number from which the mainnet will be forked. Check https://etherscan.io to pick your preferred block number. |               |
| `DEVELOPMENT_WALLET` | The public address of your development account/wallet.                                                                  |               |

## Deployed Contract Addresses

### Rinkeby Testnet

#### Mocks

- MockYOPToken - [0x7d02b6121acdd46a564542b5f1867208fd6f3cad](https://rinkeby.etherscan.io/address/0x7d02b6121acdd46a564542b5f1867208fd6f3cad)
  - It has a `mint` function that anyone can call to mint new YOP tokens. Max supply is set to 88,888,888 which is the same as the real one.
- MockYOPNFT - [0x24d1Caaf83AD4B680dcB621D10Ed320315938059](https://rinkeby.etherscan.io/address/0x24d1Caaf83AD4B680dcB621D10Ed320315938059)
  - It has a `mint` function that anyone can call to mint a new NFT for testing purpose. Currently token id `134` is allowed access to vaults.

#### Access Control

- AllowlistAccessControl - [0x029935d6E69A2DBF1eFFF64bf8f32ec89144FB49](https://rinkeby.etherscan.io/address/0x029935d6E69A2DBF1eFFF64bf8f32ec89144FB49)
- ERC1155AccessControl - [0x07e4d1dCE0Cb8F7f3513b0D7942EB188047F4223](https://rinkeby.etherscan.io/address/0x07e4d1dCE0Cb8F7f3513b0D7942EB188047F4223)
- AllowAnyAccessControl - [0x0640A44A00B61a414f4B7DCb1C61F070C1e5bDFE](https://rinkeby.etherscan.io/address/0x0640A44A00B61a414f4B7DCb1C61F070C1e5bDFE)
- AccessControlManager - [0x32F3CC19D275dAF22355C0e871D926690f790d7B](https://rinkeby.etherscan.io/address/0x32F3CC19D275dAF22355C0e871D926690f790d7B)

#### Rewards

- YOPRewards - [0x79ef209DACD0C1019589366A6A03aB6e0d14Be15](https://rinkeby.etherscan.io/address/0x79ef209DACD0C1019589366A6A03aB6e0d14Be15)

#### Staking

- Staking - [0xbD3dCc8357512CA786e68656bF8ABaC3C4E906F3](https://rinkeby.etherscan.io/address/0xbD3dCc8357512CA786e68656bF8ABaC3C4E906F3)

#### Vaults

- VaultStrategyDataStore - [0x751543288831c60CF9C3fBa2dabFbD7d507978F3](https://rinkeby.etherscan.io/address/0x751543288831c60CF9C3fBa2dabFbD7d507978F3)
- FeeCollection - [0x6A926A52f60Ef35b7D259289cF5097cA3aCD9ED0](https://rinkeby.etherscan.io/address/0x6A926A52f60Ef35b7D259289cF5097cA3aCD9ED0)
- Ethereum Genesis - [0x1C56C5a308De6F9176f7378a580e4439F22Ca106](https://rinkeby.etherscan.io/address/0x1C56C5a308De6F9176f7378a580e4439F22Ca106)
  - MockEth1 Strategy - [0x5C053998F314eab836612301637361c44297Fd7d](https://rinkeby.etherscan.io/address/0x5C053998F314eab836612301637361c44297Fd7d)
  - MockEth2 Strategy - [0x4f94b2B6E1d311c8AF38F80bbaf8a66B2eD21700](https://rinkeby.etherscan.io/address/0x4f94b2B6E1d311c8AF38F80bbaf8a66B2eD21700)
- Bitcoin Genesis - [0x8D21A7CAeE16233356D4217F478393c87710e549](https://rinkeby.etherscan.io/address/0x8D21A7CAeE16233356D4217F478393c87710e549)
  - MockBtc1 Strategy - [0xBC24E71879fa6ca9e00598524CAb5cA87BD3dd0c](https://rinkeby.etherscan.io/address/0xBC24E71879fa6ca9e00598524CAb5cA87BD3dd0c)
  - MockBtc2 Strategy - [0x6fD00F4850C7B83f7AD5e663ef9f4F18047612D0](https://rinkeby.etherscan.io/address/0x6fD00F4850C7B83f7AD5e663ef9f4F18047612D0)
- USDC Genesis - [0x2Ed01e80B170f7Bb18eF9A7A68fF3997Bc2430F5](https://rinkeby.etherscan.io/address/0x2Ed01e80B170f7Bb18eF9A7A68fF3997Bc2430F5)
  - MockUSDC1 Strategy - [0x4600Fd20d89445Ecd4136B970a9C2F0155A1e30d](https://rinkeby.etherscan.io/address/0x4600Fd20d89445Ecd4136B970a9C2F0155A1e30d)
  - MockUSDC2 Strategy - [0xDF3898B78e1E3a2205057aDD5C8E6B5Ce894AA65](https://rinkeby.etherscan.io/address/0xDF3898B78e1E3a2205057aDD5C8E6B5Ce894AA65)
- DAI Genesis - [0x4854Bbd17EFfc0cDDaa8Cc0414F6faF619D0868a](https://rinkeby.etherscan.io/address/0x4854Bbd17EFfc0cDDaa8Cc0414F6faF619D0868a)
  - MockDAI1 - [0x995ec15f3186C6F8432D045C550a9398Dbc65Fb0](https://rinkeby.etherscan.io/address/0x995ec15f3186C6F8432D045C550a9398Dbc65Fb0)
  - MockDAI2 - [0xB3d104ac6A4EBB4CDcFdd1f228AaDc733eacD95d](https://rinkeby.etherscan.io/address/0xB3d104ac6A4EBB4CDcFdd1f228AaDc733eacD95d)
- USDT Genesis- [0x9E51b7B6EC752c6870Dee9ba91c43bAf20A01995](https://rinkeby.etherscan.io/address/0x9E51b7B6EC752c6870Dee9ba91c43bAf20A01995)
  - MockUSDT1 - [0xc519A688418E2E0d1dd2B5422EBAB09fa5b5D7c9](https://rinkeby.etherscan.io/address/0xc519A688418E2E0d1dd2B5422EBAB09fa5b5D7c9)
  - MockUSDT2 - [0x69D54A8E5522F8046Dfad65B5b9FE54b8dE45991](https://rinkeby.etherscan.io/address/0x69D54A8E5522F8046Dfad65B5b9FE54b8dE45991)
