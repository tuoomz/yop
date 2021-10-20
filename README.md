# Contracts for Vaults & Strategies

## Prerequisites
* nodejs v16+
* Solidity compiler v0.8.7
* Truffle suite is installed
* A local Ethereum node, it is recommended to use the Ganache desktop app from Truffle.

## Run
* Start the local Ethereum node via the Ganache desktop app or the cli and make sure it is running
* Check the network configuration in the `truffle-config.js` file to make sure it is pointing to the local Ethereum node
* Run the following command:
    ```
    truffle compile
    truffle migrate
    ```
* The contracts should be deployed and you can interact with it via the Ganache app.

## Test
* Start the local Ethereum node via the Ganache desktop app or the cli and make sure it is running
* Check the network configuration in the `truffle-config.js` file to make sure it is pointing to the local Ethereum node
* Run
    ```
    truffle test
    ```