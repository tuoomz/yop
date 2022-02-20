import { HardhatRuntimeEnvironment } from "hardhat/types";
import axios from "axios";

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export async function createDelegate(safeAddress: string, delegateAddress: string, delegateLabel: string, hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;

  const privateKey = process.env.SAFE_TXN_PRIVATE_KEY;
  if (!privateKey) {
    console.log(`
      >>>>>> Warning  <<<<<<<<
     To use this task you must create an ENV VAR SAFE_TXN_PRIVATE_KEY
     You really should know what you are doing here.
      `);
    return;
  }

  const signer = new ethers.Wallet(privateKey, ethers.provider);
  const signerAddress = await signer.getAddress();

  console.log(`Private Key Loaded for Wallet: ${signerAddress}`);

  const totp = Math.floor(Math.floor(Date.now() / 1000) / 3600);
  const signature = await signer.signMessage(delegateAddress + totp.toString());
  const payload = {
    safe: safeAddress,
    delegate: delegateAddress,
    delegator: signerAddress,
    label: delegateLabel,
    signature,
  };

  const baseURL = fetchApiUrl(hre);
  try {
    const result = await axios.post(`${baseURL}delegates/`, payload);
    if (result.status === 201) {
      console.log("Successfully added");
      return;
    } else {
      console.log("This appears to have failed. Output:");
      console.log(result);
    }
  } catch (error) {
    console.log("ERROR:", error);
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export async function listDelegates(safeAddress: string, hre: HardhatRuntimeEnvironment) {
  const baseURL = fetchApiUrl(hre);
  const res = await axios.get(`${baseURL}/delegates/?safe=${safeAddress}`);
  console.log(res.data);
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export async function deleteDelegate(delegateAddress: string, delegatorAddress: string, hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;

  const privateKey = process.env.SAFE_TXN_PRIVATE_KEY;
  if (!privateKey) {
    console.log(`
        >>>>>> Warning  <<<<<<<<
       To use this task you must create an ENV VAR SAFE_TXN_PRIVATE_KEY
       You really should know what you are doing here.
        `);
    return;
  }

  const signer = new ethers.Wallet(privateKey, ethers.provider);
  const signerAddress = await signer.getAddress();

  console.log(`Private Key Loaded for Wallet: ${signerAddress}`);

  const totp = Math.floor(Math.floor(Date.now() / 1000) / 3600);
  const signature = await signer.signMessage(delegateAddress + totp.toString());
  const payload = {
    delegate: delegateAddress,
    delegator: delegatorAddress,
    signature,
  };

  const baseURL = fetchApiUrl(hre);
  try {
    const result = await axios.delete(`${baseURL}delegates/${delegateAddress}/`, { data: payload });
    if (result.status === 204) {
      console.log("Successfully deleted");
      return;
    } else {
      console.log("This appears to have failed. Output:");
      console.log(result);
    }
  } catch (error) {
    console.log("ERROR:", error);
  }
}

const fetchApiUrl = (hre: HardhatRuntimeEnvironment) => {
  const network = hre.network.name === "localhost" ? "mainnet" : hre.network.name;

  const apis: Record<string, Record<string, string>> = {
    mainnet: {
      gnosis_safe_transaction: "https://safe-transaction.gnosis.io/api/v1/",
    },
    rinkeby: {
      gnosis_safe_transaction: "https://safe-transaction.rinkeby.gnosis.io/api/v1/",
    },
  };

  return apis[network].gnosis_safe_transaction;
};
