// import hre from "hardhat";
import EthersSafe, { EthersAdapter } from "@gnosis.pm/safe-core-sdk";
import { SafeTransactionDataPartial, MetaTransactionData } from "@gnosis.pm/safe-core-sdk-types";
import * as EthUtil from "ethereumjs-util";
import axios, { AxiosResponse } from "axios";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ContractFunctionCall } from "../lib/ContractDeployment";

import { KmsSigner } from "aws-kms-signer";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

interface GnosisSafeTransaction {
  safe: string;
  contractTransactionHash: string;
  sender: string;
  signature: string;
  origin: string | undefined;
  to: string;
  value: string;
  data: string;
}

// Needed as you can't import hre if it being used by a built-in tasks.
// Stops us passing hre around to every function
let globalHRE: HardhatRuntimeEnvironment;

export async function proposeTxn(
  safeAddress: string,
  contractAddress: string,
  contractMethod: string,
  contractParams: string,
  implementationAddress: string,
  hre: HardhatRuntimeEnvironment,
  abi?: any
): Promise<AxiosResponse | undefined> {
  // Assign global
  globalHRE = hre;
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();

  // Allows for an override keyid or use the hardhat configured deployer key
  const keyId = hre.network.config.kmsKeyId || "";
  const signer: KmsSigner = new KmsSigner(keyId);

  const signerAddress = await signer.getAddress();
  console.log(`Proposing with KMS Key ${keyId} ; Address: ${signerAddress}`);

  // Step 1 - Create an instance of the Safe Core SDK using the ethAdapter method
  // Note this is not using KMS signer. We are only using EthersSafe to build the transaction not to send/sign
  const ethAdapter = new EthersAdapter({
    ethers: ethers,
    signer: deployer,
  });

  const safeSdk: EthersSafe = await EthersSafe.create({
    ethAdapter: ethAdapter,
    safeAddress: safeAddress,
    contractNetworks: {},
  });

  // Step 2 - Begin building our transaction. Encodes the intended contract interaction
  if (!abi) {
    const abiAddress = implementationAddress || contractAddress;
    abi = await (await fetchContractABI(abiAddress)).data.result;
  }
  const contract = new ethers.Contract(safeAddress, new ethers.utils.Interface(abi), ethers.provider);

  const encode = contract.interface.encodeFunctionData(contractMethod, contractParams ? JSON.parse(contractParams) : undefined);

  const transactions: SafeTransactionDataPartial[] = [
    {
      to: contractAddress,
      value: "0",
      data: encode,
    },
  ];

  // Step 3 - Create a "Safe" transaction ready to be signed and get its hash
  const safeTransaction = await safeSdk.createTransaction(transactions);
  const hash = await safeSdk.getTransactionHash(safeTransaction);

  const awsSig = await signer.sign(EthUtil.toBuffer(hash));
  const finalSignature = EthUtil.toRpcSig(awsSig.v, awsSig.r, awsSig.s).toString();

  // Expand the playload for the safe-transaction API
  const payload: GnosisSafeTransaction = {
    safe: safeAddress,
    contractTransactionHash: hash,
    sender: EthUtil.addHexPrefix(signerAddress.toString()),
    signature: finalSignature,
    origin: "automation",
    ...safeTransaction.data,
  };

  const propose = await gnosisProposeTx(safeAddress, payload);
  return propose;
}

export async function proposeTxns(
  safeAddress: string,
  calls: ContractFunctionCall[],
  hre: HardhatRuntimeEnvironment
): Promise<AxiosResponse | undefined> {
  // Assign global
  globalHRE = hre;
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();

  // Allows for an override keyid or use the hardhat configured deployer key
  const keyId = hre.network.config.kmsKeyId || "";
  const signer: KmsSigner = new KmsSigner(keyId);

  const signerAddress = await signer.getAddress();
  console.log(`Proposing with KMS Key ${keyId} ; Address: ${signerAddress}`);

  // Step 1 - Create an instance of the Safe Core SDK using the ethAdapter method
  // Note this is not using KMS signer. We are only using EthersSafe to build the transaction not to send/sign
  const ethAdapter = new EthersAdapter({
    ethers: ethers,
    signer: deployer,
  });

  const safeSdk: EthersSafe = await EthersSafe.create({
    ethAdapter: ethAdapter,
    safeAddress: safeAddress,
    contractNetworks: {},
  });
  const transactions: MetaTransactionData[] = [];
  for (let i = 0; i < calls.length; i++) {
    console.log(`>>>>>> multisend transaction #${i + 1} <<<<<<`);
    console.log(`contract address: ${calls[i].address}`);
    console.log(`contract method: ${calls[i].methodName}`);
    console.log(`contract params: ${JSON.stringify(calls[i].params)}`);
    const contract = new ethers.Contract(safeAddress, new ethers.utils.Interface(calls[i].abi), ethers.provider);
    const encode = contract.interface.encodeFunctionData(calls[i].methodName, calls[i].params);
    transactions.push({
      to: calls[i].address,
      value: "0",
      data: encode,
    });
  }

  // Step 3 - Create a "Safe" transaction ready to be signed and get its hash
  console.log("Proposing a MultiSend transaction");
  const safeTransaction = await safeSdk.createTransaction(transactions);
  const hash = await safeSdk.getTransactionHash(safeTransaction);

  const awsSig = await signer.sign(EthUtil.toBuffer(hash));
  const finalSignature = EthUtil.toRpcSig(awsSig.v, awsSig.r, awsSig.s).toString();

  // Expand the playload for the safe-transaction API
  const payload: GnosisSafeTransaction = {
    safe: safeAddress,
    contractTransactionHash: hash,
    sender: EthUtil.addHexPrefix(signerAddress.toString()),
    signature: finalSignature,
    origin: "automation",
    ...safeTransaction.data,
  };

  const propose = await gnosisProposeTx(safeAddress, payload);
  return propose;
}

// Pull Contract ABIs from Etherscan. All contract should be verified anyway.
const fetchContractABI = async (contract: string) => {
  const response = await axios.get(`${fetchApiUrl("etherscan")}?module=contract&action=getabi&address=${contract}&apikey=${ETHERSCAN_API_KEY}`);
  return response;
};

// Post to gnosis_safe_transaction API - https://safe-transaction.gnosis.io/
const gnosisProposeTx = async (safe: string, tx: GnosisSafeTransaction) => {
  const resp = await axios.post(`${fetchApiUrl("gnosis_safe_transaction")}safes/${safe}/multisig-transactions/`, tx);
  return resp;
};

// Map API urls - TODO: Use constants.ts but this need to be updated to not import hre (breaks tasks)
const fetchApiUrl = (apiName: string) => {
  const network = globalHRE.network.name === "localhost" ? "mainnet" : globalHRE.network.name;

  const apis: Record<string, Record<string, string>> = {
    mainnet: {
      etherscan: "https://api.etherscan.io/api",
      gnosis_safe_transaction: "https://safe-transaction.gnosis.io/api/v1/",
    },
    rinkeby: {
      etherscan: "https://api-rinkeby.etherscan.io/api",
      gnosis_safe_transaction: "https://safe-transaction.rinkeby.gnosis.io/api/v1/",
    },
    goerli: {
      etherscan: "https://api-goerli.etherscan.io/api",
      gnosis_safe_transaction: "https://safe-transaction.goerli.gnosis.io/api/v1/",
    },
  };

  return apis[network][apiName];
};
