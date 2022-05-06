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
import "hardhat-tracer";
import "hardhat-storage-layout";

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
    runOnCompile: true,
    clear: true,
    flat: false,
    spacing: 2,
    // do not use the interface-style formatting as some of the tests will fail to encode the data
    pretty: false,
    // only: [],
    // except: []
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: {
        // eslint-disable-next-line
        enabled: process.env.ENABLE_FORKING == "true",
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        blockNumber: process.env.FORK_BLOCK_NUMBER ? parseInt(process.env.FORK_BLOCK_NUMBER) : 14717539,
      },
      chainId: chainIds.hardhat,
      allowUnlimitedContractSize: true,
    },
    mainnet: {
      chainId: chainIds.mainnet,
      kmsKeyId: process.env.GNOSIS_SIGNER_KMSID,
      gas: "auto",
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
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
            runs: 10,
          },
          outputSelection: {
            "*": {
              "*": ["storageLayout"],
            },
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
    runOnCompile: process.env.REPORT_CONTRACT_SIZE === "true",
    strict: true,
    except: [".*Mock$"],
  },
  mocha: {
    timeout: 500000,
    parallel: process.env.RUN_TEST_IN_PARALLEL === "true",
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
