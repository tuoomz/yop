# Hardhat Forking

Hardhat allows you to fork the chain at an older block of the blockchain. As a developer this is helpful if you want to simulate the blockchain’s state at that block; This guide will guide you through the process of forking the Ethereum Mainnet at an older block with some helpful tasks along the way.

## Start a Fork

This repo has development scripts to aid in using forking for development. To start a fork just run:

```
npm run start-fork
```

Note: this will use the repos hardhat configuration in which using pinning is set. See:[hardhat.config.ts](../hardhat.config.ts)
Note 2: All other forking commands should be run in a second window.

## Deploy contracts to Fork

To run the contract deploy all script targeting the local network

```
npm run deploy-contracts-fork
```

## Populate Fork

Currently this populates an address with 1000 ETH, DAI and USDC. Seed scripts can be found [here](../tasks/fork)

```
npm run populate-fork
```

## Resetting the fork

Resets the local fork to the same block number defined in [hardhat.config.ts](../hardhat.config.ts)

```
npm run reset-fork
```
