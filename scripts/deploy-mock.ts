import hre from "hardhat";

import { readDeploymentFile, writeDeploymentFile } from "./util";

import { YopERC1155Mock, YOPTokenMock } from "../types";
import YOPERC1155MockABI from "../abi/contracts/mocks/YopERC1155Mock.sol/YopERC1155Mock.json";
import YOPTokenMockABI from "../abi/contracts/mocks/YOPTokenMock.sol/YOPTokenMock.json";

const NETWORK_NAME = hre.network.name;
const TARGET_ACCOUNT = process.env.TARGET_ACCOUNT;

export async function deployMockNFTContract() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log(`Deploying contracts as ${deployerAddress}`);
  let deployRecord = await readDeploymentFile();

  let address;
  let YopERC1155MockContract: YopERC1155Mock;
  /*
   *
   * Start YopERC1155Mock Contract Deploy
   *
   * */
  if (!deployRecord.YopERC1155Mock || !deployRecord.YopERC1155Mock.address) {
    console.log("Deploying YopERC1155Mock contract");
    const YopERC1155MockFactory = await ethers.getContractFactory("YopERC1155Mock");
    YopERC1155MockContract = (await YopERC1155MockFactory.deploy(1000)) as YopERC1155Mock;

    console.log(`Deploying YopERC1155Mock contract - txHash: ${YopERC1155MockContract.deployTransaction.hash}`);
    await YopERC1155MockContract.deployed();

    // Store just a reduced record
    deployRecord = {
      ...deployRecord,
      YopERC1155Mock: {
        address: YopERC1155MockContract.address,
        contractParams: [1000],
        proxy: false,
      },
    };
    await writeDeploymentFile(NETWORK_NAME, deployRecord);
    console.log(
      `YopERC1155Mock deployed - txHash: ${YopERC1155MockContract.deployTransaction.hash} - address: ${YopERC1155MockContract.address} \n\n`
    );
    address = YopERC1155MockContract.address;
  } else {
    address = deployRecord.YopERC1155Mock.address;
    console.log(`YopERC1155Mock deployed is already deployed at ${address}`);
    YopERC1155MockContract = (await ethers.getContractAt(YOPERC1155MockABI, address)) as YopERC1155Mock;
  }
  if (TARGET_ACCOUNT) {
    console.log(`Mint 1 YOP NFT token with id 134 to account ${TARGET_ACCOUNT}`);
    await YopERC1155MockContract.connect(deployer).mint(TARGET_ACCOUNT, 134, 1);
  }

  return address;
}

export async function deployMockYOPContract(wallet: string | undefined = TARGET_ACCOUNT) {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  let deployRecord = await readDeploymentFile();
  let mockYopToken: YOPTokenMock;
  if (!deployRecord.yopTokenMock || !deployRecord.yopTokenMock.address) {
    console.log("Deploying mock YOP token contract");
    const TokenMockFactory = await ethers.getContractFactory("YOPTokenMock");
    mockYopToken = (await TokenMockFactory.deploy("YOP", "YOP")) as YOPTokenMock;
    console.log(`Deploying mock YOP token contract - txHash: ${mockYopToken.deployTransaction.hash}`);
    await mockYopToken.deployed();

    deployRecord = {
      ...deployRecord,
      yopTokenMock: {
        address: mockYopToken.address,
        contractParams: ["YOP", "YOP"],
        proxy: false,
      },
    };
    await writeDeploymentFile(NETWORK_NAME, deployRecord);
    console.log(`YOP mock token deployed - txHash: ${mockYopToken.deployTransaction.hash} - address: ${mockYopToken.address} \n\n`);
  } else {
    mockYopToken = (await ethers.getContractAt(YOPTokenMockABI, deployRecord.yopTokenMock.address)) as YOPTokenMock;
  }

  if (wallet) {
    console.log(`Mint 11,111,111 YOP tokens to account ${wallet}`);
    await mockYopToken.connect(deployer).mint(wallet, ethers.utils.parseUnits("11111111", 8));
  }
  return mockYopToken.address;
}

async function main() {
  // await deployMockYOPContract(undefined);
  // await deployMockNFTContract();
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  // Receiver Address which receives Ether
  const receiverAddress = "0x20D11fF430469a6b04f68913DbfE7D480daBe0aA";
  // Ether amount to send
  const amountInEther = "0.04";
  // Create a transaction object
  const tx = {
    to: receiverAddress,
    // Convert currency unit from ether to wei
    value: ethers.utils.parseEther(amountInEther),
  };
  // Send a transaction
  deployer.sendTransaction(tx).then((txObj) => {
    console.log("txHash", txObj.hash);
  });
}

main();
