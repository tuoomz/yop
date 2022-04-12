import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades, waffle } from "hardhat";
import { MockContract } from "ethereum-waffle";
import StakingV2ABI from "../../../abi/contracts/staking/StakingV2.sol/StakingV2.json";
import UniswapV2ABI from "../../../abi/@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router01.sol/IUniswapV2Router01.json";
import UniswapV2FactoryABI from "../../../abi/@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol/IUniswapV2Factory.json";
import YOPRegistryABI from "../../../abi/contracts/registry/YOPRegistry.sol/YOPRegistry.json";
import IWETHABI from "../../../abi/contracts/interfaces/IWeth.sol/IWETH.json";
import SingleAssetVaultABI from "../../../abi/contracts/vaults/SingleAssetVaultV2.sol/SingleAssetVaultV2.json";
import ERC20ABI from "../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import { YOPRouter } from "../../../types";
import { BigNumber, ContractFactory } from "ethers";

const FUTER_TIME = 2532717587; // 2050-4-4
const PAST_TIME = 1586032787; // 2020-4-4
const { deployMockContract } = waffle;

describe("YOPRouter", async () => {
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let user: SignerWithAddress;
  let stakingContract: MockContract;
  let uniswapFactory: MockContract;
  let uniswapContract: MockContract;
  let vaultContract: MockContract;
  let yopRegistry: MockContract;
  let yopToken: MockContract;
  let wethToken: MockContract;
  let YOPRouterFactory: ContractFactory;
  let yopRouter: YOPRouter;

  beforeEach(async () => {
    [deployer, governance, user] = await ethers.getSigners();
    stakingContract = await deployMockContract(deployer, StakingV2ABI);
    uniswapContract = await deployMockContract(deployer, UniswapV2ABI);
    uniswapFactory = await deployMockContract(deployer, UniswapV2FactoryABI);
    vaultContract = await deployMockContract(deployer, SingleAssetVaultABI);
    yopRegistry = await deployMockContract(deployer, YOPRegistryABI);
    yopToken = await deployMockContract(deployer, ERC20ABI);
    wethToken = await deployMockContract(deployer, IWETHABI);
    YOPRouterFactory = await ethers.getContractFactory("YOPRouter");
    const params = [
      governance.address,
      stakingContract.address,
      uniswapContract.address,
      yopRegistry.address,
      yopToken.address,
      wethToken.address,
    ];
    yopRouter = (await upgrades.deployProxy(YOPRouterFactory, params, {
      kind: "uups",
      unsafeAllow: ["constructor"],
    })) as YOPRouter;
    await uniswapContract.mock.factory.returns(uniswapFactory.address);
    await yopRegistry.mock.currentVault.returns(vaultContract.address);
  });

  describe("previewSwapForDepositERC20", async () => {
    it("should revert if token address is not valid", async () => {
      await expect(yopRouter.previewSwap(ethers.constants.AddressZero, BigNumber.from("2000"), yopToken.address)).to.be.revertedWith("!token");
      await expect(yopRouter.previewSwap(yopToken.address, BigNumber.from("2000"), ethers.constants.AddressZero)).to.be.revertedWith("!token");
    });

    it("should revert if amount in is valid", async () => {
      await expect(yopRouter.previewSwap(wethToken.address, ethers.constants.Zero, yopToken.address)).to.be.revertedWith("!amount");
    });

    it("should return preview amount if tokenIn and tokenOut addresses are the same", async () => {
      const amount = BigNumber.from("2000");
      expect(await yopRouter.previewSwap(wethToken.address, amount, wethToken.address)).to.equal(amount);
    });

    it("should return preview amount when there is no pool for the pair", async () => {
      await uniswapFactory.mock.getPair.returns(ethers.constants.AddressZero);
      const amountOut = BigNumber.from("1800");
      await uniswapContract.mock.getAmountsOut.returns([0, 0, amountOut]);
      expect(await yopRouter.previewSwap(wethToken.address, BigNumber.from("2000"), yopToken.address)).to.equal(amountOut);
    });
  });

  describe("swapAndStakeERC20", async () => {
    const inAmount = ethers.utils.parseEther("2");
    it("should revert if token address is not valid", async () => {
      await expect(
        yopRouter.swapAndStakeERC20(ethers.constants.AddressZero, inAmount, ethers.constants.Zero, ethers.constants.Zero, 12, FUTER_TIME, [])
      ).to.be.revertedWith("!token");
    });

    it("should revert if lock period is not valid", async () => {
      await expect(
        yopRouter.swapAndStakeERC20(wethToken.address, inAmount, ethers.constants.Zero, ethers.constants.Zero, 0, FUTER_TIME, [])
      ).to.be.revertedWith("!lockPeriod");
      await expect(
        yopRouter.swapAndStakeERC20(wethToken.address, inAmount, ethers.constants.Zero, ethers.constants.Zero, 61, FUTER_TIME, [])
      ).to.be.revertedWith("!lockPeriod");
    });

    it("should revert if deadline is not valid", async () => {
      await expect(
        yopRouter.swapAndStakeERC20(wethToken.address, inAmount, ethers.constants.Zero, ethers.constants.Zero, 1, PAST_TIME, [])
      ).to.be.revertedWith("expired");
    });

    it("should revert if amount is 0", async () => {
      await expect(
        yopRouter.swapAndStakeERC20(wethToken.address, ethers.constants.Zero, ethers.constants.Zero, ethers.constants.Zero, 1, FUTER_TIME, [])
      ).to.be.revertedWith("!amount");
    });

    it("should success if tokenIn amount is greater than 0", async () => {
      await wethToken.mock.transferFrom.returns(true);
      await wethToken.mock.allowance.returns(0);
      await wethToken.mock.approve.returns(true);
      await uniswapFactory.mock.getPair.returns(yopToken.address);
      const outAmount = ethers.utils.parseUnits("1000", 6);
      await uniswapContract.mock.swapExactTokensForTokens.returns([0, outAmount]);
      await yopToken.mock.allowance.returns(0);
      await yopToken.mock.approve.returns(true);
      await stakingContract.mock.stakeAndBoostForUser.returns(0);
      await yopRouter.connect(user).swapAndStakeERC20(wethToken.address, inAmount, 0, 0, 3, FUTER_TIME, []);
    });

    it("should success if tokenIn and tokenOut are the same", async () => {
      await yopToken.mock.transferFrom.returns(true);
      await yopToken.mock.allowance.returns(0);
      await yopToken.mock.approve.returns(true);
      await stakingContract.mock.stakeAndBoostForUser.returns(0);
      await yopRouter.connect(user).swapAndStakeERC20(yopToken.address, inAmount, 0, 0, 3, FUTER_TIME, []);
    });

    it("should success if existing YOP amount is greater than 0", async () => {
      await yopToken.mock.transferFrom.returns(true);
      await yopToken.mock.allowance.returns(0);
      await yopToken.mock.approve.returns(true);
      await stakingContract.mock.stakeAndBoostForUser.returns(0);
      await yopRouter.connect(user).swapAndStakeERC20(wethToken.address, 0, 0, inAmount, 3, FUTER_TIME, []);
    });

    it("should success if both tokenIn amount and existing YOP amount is greater than 0", async () => {
      await yopToken.mock.transferFrom.returns(true);
      await wethToken.mock.transferFrom.returns(true);
      await wethToken.mock.allowance.returns(0);
      await wethToken.mock.approve.returns(true);
      await uniswapFactory.mock.getPair.returns(yopToken.address);
      const outAmount = ethers.utils.parseUnits("1000", 6);
      await uniswapContract.mock.swapExactTokensForTokens.returns([0, outAmount]);
      await yopToken.mock.allowance.returns(0);
      await yopToken.mock.approve.returns(true);
      await stakingContract.mock.stakeAndBoostForUser.returns(0);
      await yopRouter.connect(user).swapAndStakeERC20(wethToken.address, inAmount, 0, inAmount, 3, FUTER_TIME, []);
    });

    it("should success if approvals are already granted", async () => {
      await yopToken.mock.transferFrom.returns(true);
      await wethToken.mock.transferFrom.returns(true);
      // allowance is greater than 0, no approval is needed
      await wethToken.mock.allowance.returns(1);
      await uniswapFactory.mock.getPair.returns(yopToken.address);
      const outAmount = ethers.utils.parseUnits("1000", 6);
      await uniswapContract.mock.swapExactTokensForTokens.returns([0, outAmount]);
      // allowance is greater than 0, no approval is needed
      await yopToken.mock.allowance.returns(1);
      await stakingContract.mock.stakeAndBoostForUser.returns(0);
      await yopRouter.connect(user).swapAndStakeERC20(wethToken.address, inAmount, 0, inAmount, 3, FUTER_TIME, []);
    });
  });

  describe("swapAndStakeETH", async () => {
    const inAmount = ethers.utils.parseEther("2");
    it("should revert if no ETH is sent", async () => {
      await expect(
        yopRouter.connect(user).swapAndStakeETH(ethers.constants.Zero, ethers.constants.Zero, 12, FUTER_TIME, [], { value: 0 })
      ).to.be.revertedWith("!eth");
    });

    it("should revert if lock period is not valid", async () => {
      await expect(
        yopRouter.swapAndStakeETH(ethers.constants.Zero, ethers.constants.Zero, 0, FUTER_TIME, [], { value: inAmount })
      ).to.be.revertedWith("!lockPeriod");
      await expect(
        yopRouter.swapAndStakeETH(ethers.constants.Zero, ethers.constants.Zero, 61, FUTER_TIME, [], { value: inAmount })
      ).to.be.revertedWith("!lockPeriod");
    });

    it("should revert if deadline is not valid", async () => {
      await expect(
        yopRouter.swapAndStakeETH(ethers.constants.Zero, ethers.constants.Zero, 1, PAST_TIME, [], { value: inAmount })
      ).to.be.revertedWith("expired");
    });

    it("should success if ETH amount is greater than 0", async () => {
      await wethToken.mock.deposit.returns();
      await uniswapFactory.mock.getPair.returns(yopToken.address);
      const outAmount = ethers.utils.parseUnits("1000", 6);
      await uniswapContract.mock.swapExactETHForTokens.returns([0, outAmount]);
      await yopToken.mock.allowance.returns(0);
      await yopToken.mock.approve.returns(true);
      await stakingContract.mock.stakeAndBoostForUser.returns(0);
      await yopRouter.connect(user).swapAndStakeETH(0, 0, 3, FUTER_TIME, [], { value: inAmount });
    });

    it("should success if both ETH amount and existing YOP amount is greater than 0", async () => {
      await yopToken.mock.transferFrom.returns(true);
      await wethToken.mock.deposit.returns();
      await uniswapFactory.mock.getPair.returns(yopToken.address);
      const outAmount = ethers.utils.parseUnits("1000", 6);
      await uniswapContract.mock.swapExactETHForTokens.returns([0, outAmount]);
      await yopToken.mock.allowance.returns(0);
      await yopToken.mock.approve.returns(true);
      await stakingContract.mock.stakeAndBoostForUser.returns(0);
      await yopRouter.connect(user).swapAndStakeETH(0, inAmount, 3, FUTER_TIME, [], { value: inAmount });
    });
  });

  describe("swapAndDepositERC20", async () => {
    const inAmount = ethers.utils.parseEther("2");
    it("should revert if token address is not valid", async () => {
      await expect(
        yopRouter.swapAndDepositERC20(
          ethers.constants.AddressZero,
          inAmount,
          yopToken.address,
          ethers.constants.Zero,
          ethers.constants.Zero,
          FUTER_TIME
        )
      ).to.be.revertedWith("!token");
      await expect(
        yopRouter.swapAndDepositERC20(
          wethToken.address,
          inAmount,
          ethers.constants.AddressZero,
          ethers.constants.Zero,
          ethers.constants.Zero,
          FUTER_TIME
        )
      ).to.be.revertedWith("!token");
    });

    it("should revert if deadline is not valid", async () => {
      await expect(
        yopRouter.swapAndDepositERC20(wethToken.address, inAmount, yopToken.address, ethers.constants.Zero, ethers.constants.Zero, PAST_TIME)
      ).to.be.revertedWith("expired");
    });

    it("should revert if amount is 0", async () => {
      await expect(
        yopRouter.swapAndDepositERC20(
          wethToken.address,
          ethers.constants.Zero,
          yopToken.address,
          ethers.constants.Zero,
          ethers.constants.Zero,
          FUTER_TIME
        )
      ).to.be.revertedWith("!amount");
    });

    it("should revert if vault address is not valid", async () => {
      await yopRegistry.mock.currentVault.returns(ethers.constants.AddressZero);
      await expect(
        yopRouter.swapAndDepositERC20(wethToken.address, inAmount, yopToken.address, ethers.constants.Zero, ethers.constants.Zero, FUTER_TIME)
      ).to.be.revertedWith("!vault");
    });

    it("should success if tokenIn amount is greater than 0", async () => {
      await yopRegistry.mock.currentVault.returns(vaultContract.address);
      await wethToken.mock.transferFrom.returns(true);
      await wethToken.mock.allowance.returns(0);
      await wethToken.mock.approve.returns(true);
      await uniswapFactory.mock.getPair.returns(yopToken.address);
      const outAmount = ethers.utils.parseUnits("1000", 6);
      await uniswapContract.mock.swapExactTokensForTokens.returns([0, outAmount]);
      await yopToken.mock.allowance.returns(0);
      await yopToken.mock.approve.returns(true);
      await vaultContract.mock.deposit.returns(outAmount);
      await yopRouter.connect(user).swapAndDepositERC20(wethToken.address, inAmount, yopToken.address, 0, 0, FUTER_TIME);
    });

    it("should success if existing tokenOut amount is greater than 0", async () => {
      await yopToken.mock.transferFrom.returns(true);
      await yopToken.mock.allowance.returns(0);
      await yopToken.mock.approve.returns(true);
      await vaultContract.mock.deposit.returns(inAmount);
      await yopRouter.connect(user).swapAndDepositERC20(wethToken.address, 0, yopToken.address, 0, inAmount, FUTER_TIME);
    });

    it("should success if both tokenIn amount and existing tokenOut amount is greater than 0", async () => {
      await yopToken.mock.transferFrom.returns(true);
      await wethToken.mock.transferFrom.returns(true);
      await wethToken.mock.allowance.returns(0);
      await wethToken.mock.approve.returns(true);
      await uniswapFactory.mock.getPair.returns(yopToken.address);
      const outAmount = ethers.utils.parseUnits("1000", 6);
      await uniswapContract.mock.swapExactTokensForTokens.returns([0, outAmount]);
      await yopToken.mock.allowance.returns(0);
      await yopToken.mock.approve.returns(true);
      await vaultContract.mock.deposit.returns(inAmount);
      await yopRouter.connect(user).swapAndDepositERC20(wethToken.address, inAmount, yopToken.address, 0, inAmount, FUTER_TIME);
    });

    it("should success if approvals are already granted", async () => {
      await yopToken.mock.transferFrom.returns(true);
      await wethToken.mock.transferFrom.returns(true);
      await wethToken.mock.allowance.returns(1);
      await uniswapFactory.mock.getPair.returns(yopToken.address);
      const outAmount = ethers.utils.parseUnits("1000", 6);
      await uniswapContract.mock.swapExactTokensForTokens.returns([0, outAmount]);
      await yopToken.mock.allowance.returns(1);
      await vaultContract.mock.deposit.returns(inAmount);
      await yopRouter.connect(user).swapAndDepositERC20(wethToken.address, inAmount, yopToken.address, 0, inAmount, FUTER_TIME);
    });
  });

  describe("swapAndDepositETH", async () => {
    const inAmount = ethers.utils.parseEther("2");
    it("should revert if no ETH is sent", async () => {
      await expect(
        yopRouter.connect(user).swapAndDepositETH(yopToken.address, ethers.constants.Zero, ethers.constants.Zero, FUTER_TIME, { value: 0 })
      ).to.be.revertedWith("!eth");
    });

    it("should revert if token address is not valid", async () => {
      await expect(
        yopRouter.connect(user).swapAndDepositETH(ethers.constants.AddressZero, ethers.constants.Zero, ethers.constants.Zero, PAST_TIME, {
          value: inAmount,
        })
      ).to.be.revertedWith("!token");
    });

    it("should revert if deadline is not valid", async () => {
      await expect(
        yopRouter.connect(user).swapAndDepositETH(yopToken.address, ethers.constants.Zero, ethers.constants.Zero, PAST_TIME, { value: inAmount })
      ).to.be.revertedWith("expired");
    });

    it("should revert if vault address is not valid", async () => {
      await yopRegistry.mock.currentVault.returns(ethers.constants.AddressZero);
      await expect(
        yopRouter
          .connect(user)
          .swapAndDepositETH(yopToken.address, ethers.constants.Zero, ethers.constants.Zero, FUTER_TIME, { value: inAmount })
      ).to.be.revertedWith("!vault");
    });

    it("should success if ETH amount is greater than 0", async () => {
      await wethToken.mock.deposit.returns();
      await uniswapFactory.mock.getPair.returns(yopToken.address);
      const outAmount = ethers.utils.parseUnits("1000", 6);
      await uniswapContract.mock.swapExactETHForTokens.returns([0, outAmount]);
      await wethToken.mock.allowance.returns(0);
      await wethToken.mock.approve.returns(true);
      await vaultContract.mock.deposit.returns(outAmount);
      await yopRouter.connect(user).swapAndDepositETH(wethToken.address, 0, 0, FUTER_TIME, { value: inAmount });
    });

    it("should success if both ETH amount and existing tokenOut amount is greater than 0", async () => {
      await yopToken.mock.transferFrom.returns(true);
      await wethToken.mock.deposit.returns();
      await uniswapFactory.mock.getPair.returns(yopToken.address);
      const outAmount = ethers.utils.parseUnits("1000", 6);
      await uniswapContract.mock.swapExactETHForTokens.returns([0, outAmount]);
      await yopToken.mock.allowance.returns(0);
      await yopToken.mock.approve.returns(true);
      await vaultContract.mock.deposit.returns(outAmount);
      await yopRouter.connect(user).swapAndDepositETH(yopToken.address, 0, inAmount, FUTER_TIME, { value: inAmount });
    });
  });
});
