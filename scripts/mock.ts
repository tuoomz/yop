import hre from "hardhat";

import { readDeploymentFile, writeDeploymentFile } from "./util";

import { YopERC1155Mock, TokenMock } from "../types";

export async function deployMockNFTContract() {
  const { ethers } = hre;
  let deployRecord = await readDeploymentFile();

  /*
   *
   * Start YopERC1155Mock Contract Deploy
   *
   * */

  console.log("Deploying YopERC1155Mock contract");
  const YopERC1155MockFactory = await ethers.getContractFactory("YopERC1155Mock");
  const YopERC1155MockContract: YopERC1155Mock = (await YopERC1155MockFactory.deploy(1000)) as YopERC1155Mock;

  console.log(`Deploying YopERC1155Mock contract - txHash: ${YopERC1155MockContract.deployTransaction.hash}`);
  await YopERC1155MockContract.deployed();

  // Store just a reduced record
  deployRecord = {
    ...deployRecord,
    YopERC1155Mock: {
      address: YopERC1155MockContract.address,
    },
  };
  await writeDeploymentFile(deployRecord);
  console.log(
    `YopERC1155Mock deployed - txHash: ${YopERC1155MockContract.deployTransaction.hash} - address: ${YopERC1155MockContract.address} \n\n`
  );

  return YopERC1155MockContract.address;
}

export async function deployMockYOPContract(wallet: string | undefined) {
  const { ethers } = hre;
  let deployRecord = await readDeploymentFile();

  console.log("Deploying mock YOP token contract");
  const TokenMockFactory = await ethers.getContractFactory("TokenMock");
  const mockYopToken = (await TokenMockFactory.deploy("yop", "yop")) as TokenMock;
  console.log(`Deploying mock YOP token contract - txHash: ${mockYopToken.deployTransaction.hash}`);
  await mockYopToken.deployed();

  deployRecord = {
    ...deployRecord,
    yopTokenMock: {
      address: mockYopToken.address,
    },
  };
  await writeDeploymentFile(deployRecord);
  console.log(`YOP mock token deployed - txHash: ${mockYopToken.deployTransaction.hash} - address: ${mockYopToken.address} \n\n`);
  if (wallet != null && wallet !== "") {
    console.log(`Mint 88,888,888 tokens to wallet address ${wallet}`);
    mockYopToken.mint(wallet, 88888888);
  }
  return mockYopToken.address;
}
