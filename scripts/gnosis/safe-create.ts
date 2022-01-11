import Safe, { EthersAdapter, SafeFactory, SafeAccountConfig } from "@gnosis.pm/safe-core-sdk";
import { HardhatRuntimeEnvironment } from "hardhat/types";

export async function createSafe(owners: string[], threshold: number, seederKey: string, hre: HardhatRuntimeEnvironment): Promise<Safe> {
  const { ethers } = hre;

  const privateKey = seederKey;
  const signer = new ethers.Wallet(privateKey, ethers.provider);
  const signerAddress = await signer.getAddress();

  console.log(`Private Key Loaded for Wallet: ${signerAddress}`);

  const ethAdapter = new EthersAdapter({ ethers, signer });

  const safeFactory = await SafeFactory.create({ ethAdapter });
  const safeAccountConfig: SafeAccountConfig = { owners, threshold };
  const safe: Safe = await safeFactory.deploySafe(safeAccountConfig);

  return safe;
}
