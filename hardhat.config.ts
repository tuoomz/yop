import * as dotenv from "dotenv";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-solhint";
import "@nomiclabs/hardhat-waffle";
import "hardhat-abi-exporter";
import "@tenderly/hardhat-tenderly";
import "@typechain/hardhat";
import "hardhat-deploy-ethers";
import "hardhat-gas-reporter";
import "hardhat-spdx-license-identifier";
import "hardhat-watcher";
import "solidity-coverage";
import "hardhat-contract-sizer";
import "@rumblefishdev/hardhat-kms-signer";
import "@openzeppelin/hardhat-upgrades";

import { NetworkUserConfig, HardhatUserConfig } from "hardhat/types";

import assert from "assert";

// eslint-disable-next-line node/no-missing-import
import "./tasks";

import { removeConsoleLog } from "hardhat-preprocessor";

dotenv.config();

// Allow CI to pass but fail for dev use to help show where the problem is
if (!process.env.CI) {
  const requiredEnvVar = ["ALCHEMY_API_KEY", "TESTNET_SIGNER_KMSID"];
  requiredEnvVar.forEach((conf) => assert(process.env[conf], `Missing ENV VAR variable: ${conf}. Please set your .env`));
}
const chainIds = {
  goerli: 5,
  hardhat: 31337,
  kovan: 42,
  mainnet: 1,
  rinkeby: 4,
  ropsten: 3,
};

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  abiExporter: {
    path: "./abi",
    clear: false,
    flat: true,
    // only: [],
    // except: []
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: {
        // eslint-disable-next-line eqeqeq
        enabled: process.env.ENABLE_FORKING == "true",
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        blockNumber: 13612911,
      },
      chainId: 31337,
    },
    goerli: createTestnetConfig("goerli"),
    kovan: createTestnetConfig("kovan"),
    rinkeby: createTestnetConfig("rinkeby"),
    ropsten: createTestnetConfig("ropsten"),
  },
  paths: {
    artifacts: "artifacts",
    cache: "cache",
    sources: "contracts",
    tests: "test",
  },
  preprocess: {
    eachLine: removeConsoleLog((bre) => bre.network.name !== "hardhat" && bre.network.name !== "localhost"),
  },
  solidity: {
    compilers: [
      {
        version: "0.8.9",
        settings: {
          optimizer: {
            enabled: true,
            runs: 120,
          },
        },
      },
    ],
  },
  spdxLicenseIdentifier: {
    overwrite: false,
    runOnCompile: true,
  },
  tenderly: {
    project: process.env.TENDERLY_PROJECT!,
    username: process.env.TENDERLY_USERNAME!,
  },
  typechain: {
    outDir: "types",
    target: "ethers-v5",
  },
  gasReporter: {
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    currency: "USD",
    gasPrice: 79,
    enabled: process.env.REPORT_GAS === "true",
    excludeContracts: ["contracts/mocks/", "contracts/libraries/"],
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  watcher: {
    compile: {
      tasks: ["compile"],
      files: ["./contracts"],
      verbose: true,
    },
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: false,
  },
};

function createTestnetConfig(network: keyof typeof chainIds): NetworkUserConfig {
  const url: string = "https://eth-" + network + ".alchemyapi.io/v2/" + process.env.ALCHEMY_API_KEY;
  return {
    chainId: chainIds[network],
    gas: "auto",
    url,
    kmsKeyId: process.env.TESTNET_SIGNER_KMSID,
  };
}

export default config;
