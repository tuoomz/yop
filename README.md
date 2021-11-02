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

## Other available commands

```
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
