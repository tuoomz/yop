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

## Other available commands

```bash
npx hardhat accounts
npx hardhat clean
npx hardhat node
npx hardhat help
REPORT_GAS=true npx hardhat test
npx hardhat coverage
npx hardhat run scripts/deploy.ts
npx hardhat size-contracts
TS_NODE_FILES=true npx ts-node scripts/deploy.ts
npx eslint '**/*.{js,ts}'
npx eslint '**/*.{js,ts}' --fix
npx prettier '**/*.{json,sol,md}' --check
npx prettier '**/*.{json,sol,md}' --write
npx solhint 'contracts/**/*.sol'
npx solhint 'contracts/**/*.sol' --fix
```

For more information, please checkout [Hardhat docs](https://hardhat.org/getting-started/).
