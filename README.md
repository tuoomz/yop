# Contracts for Vaults & Strategies

## Prerequisites

- Nodejs LTS (v14). It is recommended to use [nvm](https://github.com/nvm-sh/nvm) to support multiple versions of nodejs locally.
- Solidity compiler v0.8.9
- It uses [hardhat](https://hardhat.org/), no need to install anything, just run `npm install .`

## Build

```
npx hardhat compile
```

## Test

```
npx hardhat test
```

To run tests with the solidity events emmited to the console run

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

Before you can deploy you need to have a populated .env file in the root of this project using .env.example as an example.

### Local Mainnet Fork

```bash
#Start a local fork of mainnet
npm run start-fork
#Deploy contracts and seed wallets
npm run deploy-contracts-fork
npm run populate-fork
#Reset local fork
npm run reset-fork
```

More detail information on forking can be found [here](docs/dev_forking_mainnet.md).

### Deploy To Mainnet Fork

See [deployment by config](./scripts/README.md).

#### More Coming Soon

### Upgrade
To upgrade a contract you need to provide the current contract name and the new contract name. The script will look up the previous deployment to find the proxy address.

```bash
export CURRENT_CONTRACT_FACTORY_NAME=Vault
export NEW_CONTRACT_FACTORY_NAME=VaultV2
# Upgrade on rinkeby
npx hardhat run --network rinkeby scripts/propose-upgrade.ts
```

**NOTE:** This will only prepare an upgrade. The upgrade still needs to be signed off by the governor address. In the case of a https://gnosis-safe.io/ multisig, an owner needs to create a Contract interaction against the proxy address. The ABI must be provided due to an issue with hardhat verifying implementation contracts.

The owner must choose the upgradeTo method providing the new implementation contract address that is provided in the deploy script output. Once the transaction is approved by the required number of owners the upgrade will complete.

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

## Deployed Contract Addresses

### Rinkeby Testnet

#### Access Control

- AllowlistAccessControl - [0xd3e4955B464c758385c72C95f981711D39CC9215](https://rinkeby.etherscan.io/address/0xd3e4955B464c758385c72C95f981711D39CC9215)
- ERC1155AccessControl - [0x4dB8b94B34259C220D159b502D48477Bff2625fA](https://rinkeby.etherscan.io/address/0x4dB8b94B34259C220D159b502D48477Bff2625fA)
- AllowAnyAccessControl - [0x35738b461D85cB013460F0E4FE9631bD533bbe86](https://rinkeby.etherscan.io/address/0x35738b461D85cB013460F0E4FE9631bD533bbe86)
- AccessControlManager - [0x838Aaf65Dde430A41455F1f287D947D3754419bb](https://rinkeby.etherscan.io/address/0x838Aaf65Dde430A41455F1f287D947D3754419bb)

#### Rewards

- YOPRewards - [0xA9fb988A75960CAae1bc55556FdD7F463A255ae0](https://rinkeby.etherscan.io/address/0xA9fb988A75960CAae1bc55556FdD7F463A255ae0)

#### Staking

- Staking - [0xeD3B3A4aC33A3861DcA995A31A161ddB9F809b68](https://rinkeby.etherscan.io/address/0xeD3B3A4aC33A3861DcA995A31A161ddB9F809b68)

#### Vaults

- VaultStrategyDataStore - [0xc5c788EDb6814edea110f2C3A83492C6b0147731](https://rinkeby.etherscan.io/address/0xc5c788EDb6814edea110f2C3A83492C6b0147731)
- FeeCollection - [0x7b34A8998f0467C71827a7FE47b5326e677a78b3](https://rinkeby.etherscan.io/address/0x7b34A8998f0467C71827a7FE47b5326e677a78b3)
- Ethereum Genesis - [0xC17B83b33af998ab782E74fD271e354cf4aee2AB](https://rinkeby.etherscan.io/address/0xC17B83b33af998ab782E74fD271e354cf4aee2AB)
  - MockEth1 Strategy - [0x535f4B796b516b7bDBf7cbceD6c2e6826796Eab3](https://rinkeby.etherscan.io/address/0x535f4B796b516b7bDBf7cbceD6c2e6826796Eab3)
  - MockEth2 Strategy - [0x5903f3406CE80dC4f282cF6Dc03453957af629c0](https://rinkeby.etherscan.io/address/0x5903f3406CE80dC4f282cF6Dc03453957af629c0)
- Bitcoin Genesis - [0xB9249aF92B75AE9D81888b46C0Cd810112b8C2cc](https://rinkeby.etherscan.io/address/0xB9249aF92B75AE9D81888b46C0Cd810112b8C2cc)
  - MockBtc1 Strategy - [0x53ea4ffD37DAe63c6D111321C7bd4eBA87185745](https://rinkeby.etherscan.io/address/0x53ea4ffD37DAe63c6D111321C7bd4eBA87185745)
  - MockBtc2 Strategy - [0x0Acf6DF2ea0cF41f075bE3508319B04198eDB3CC](https://rinkeby.etherscan.io/address/0x0Acf6DF2ea0cF41f075bE3508319B04198eDB3CC)
- USDC Genesis - [0x138667b07F6a8c22CBbdEfCd1E7Fb78307E96C9B](https://rinkeby.etherscan.io/address/0x138667b07F6a8c22CBbdEfCd1E7Fb78307E96C9B)
  - MockUSDC1 Strategy - [0x1d4b9a3b7a69A17b80C30F17E6ff6820dC24e3A4](https://rinkeby.etherscan.io/address/0x1d4b9a3b7a69A17b80C30F17E6ff6820dC24e3A4)
  - MockUSDC2 Strategy - [0x7EE1568b5dD73eBd8DB9eC0c2fbD372EAC4ddB6b](https://rinkeby.etherscan.io/address/0x7EE1568b5dD73eBd8DB9eC0c2fbD372EAC4ddB6b)
- DAI Genesis - [0xAf3B1f91FdE4120BeD7f4209fB15aDF318A0CF50](https://rinkeby.etherscan.io/address/0xAf3B1f91FdE4120BeD7f4209fB15aDF318A0CF50)
  - MockDAI1 - [0xCDDb89866Ccc86aae747DEAad27967adD418Aa4D](https://rinkeby.etherscan.io/address/0xCDDb89866Ccc86aae747DEAad27967adD418Aa4D)
  - MockDAI2 - [0xAaB7772d7078FFcE423244f1900275d2492920A1](https://rinkeby.etherscan.io/address/0xAaB7772d7078FFcE423244f1900275d2492920A1)
- USDT Genesis- [0x31A324446BA6653BaFdb3757ae81D38250A13f20](https://rinkeby.etherscan.io/address/0x31A324446BA6653BaFdb3757ae81D38250A13f20)
  - MockUSDT1 - [0x6A9c71252349E9dd540014C1386eBC60a254718D](https://rinkeby.etherscan.io/address/0x6A9c71252349E9dd540014C1386eBC60a254718D)
  - MockUSDT2 - [0xE0C8436D96D596B7011Ff8f8286BB4289792b4AF](https://rinkeby.etherscan.io/address/0xE0C8436D96D596B7011Ff8f8286BB4289792b4AF)
