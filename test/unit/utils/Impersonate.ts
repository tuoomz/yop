import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers, network } from "hardhat";

// this is useful to send transactions on behalf of a contract (or any account really).
// It only works for hardhat network.
export async function impersonate(account: string): Promise<SignerWithAddress> {
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [account],
  });
  const signer = await ethers.getSigner(account);

  await network.provider.send("hardhat_setBalance", [
    account,
    "0x100000000000000000", // 2.9514791e+20 wei
  ]);

  return signer;
}
