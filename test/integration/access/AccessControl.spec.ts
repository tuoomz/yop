import { expect } from "chai";
import { setupVault, impersonate, setEthBalance, reset } from "../shared/setup";
import { ethers } from "hardhat";
import { SingleAssetVault } from "../../../types/SingleAssetVault";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Staking } from "../../../types/Staking";
import { AccessControlManager } from "../../../types/AccessControlManager";
import { AllowAnyAccessControl } from "../../../types/AllowAnyAccessControl";
import { SanctionsListAccessControl } from "../../../types/SanctionsListAccessControl";
import { ERC1155AccessControl } from "../../../types/ERC1155AccessControl";
import { IWETH } from "../../../types";
import IWethABI from "../../../abi/contracts/interfaces/IWeth.sol/IWETH.json";
import ERC20ABI from "../../../abi/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json";
import { ERC20 } from "../../../types/ERC20";
import { CONST } from "../../constants";

const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const WETH_WHALE_ADDRESS = "0x2f0b23f53734252bda2277357e97e1517d6b042a";
const ONE_THOUSAND_YOP = ethers.utils.parseUnits("1000", 8);
const YOP_NFT_CONTRACT_ADDRESS = "0xe4605d46fd0b3f8329d936a8b258d69276cba264";
const YOP_NFT_IDS = ["134", "135", "136", "503", "504", "505"];
const YOP_NFT_WHALE_ADDRESS = "0x4f0dbc8af1d058c316b09f69437722e699cfb6bd";

const SANCTIONED_ADDRESS = "0x7F367cC41522cE07553e823bf3be79A889DEbe1B";
const depositAmount = ethers.utils.parseEther("10");

describe("AccessControl [@skip-on-coverage]", async () => {
  let governance: SignerWithAddress;
  let user: SignerWithAddress;
  let vault: SingleAssetVault;
  let yopStaking: Staking;
  let accessManager: AccessControlManager;
  let allowAnyAccessControl: AllowAnyAccessControl;
  let sanctionsListAccessControl: SanctionsListAccessControl;
  let erc1155AccessControl: ERC1155AccessControl;
  let yopWalletAccount: SignerWithAddress;
  let wethContract: IWETH;
  let yopContract: ERC20;
  let yopNftHolder: SignerWithAddress;

  beforeEach(async () => {
    await reset(14356555);
    ({ vault, governance, yopStaking, accessManager, allowAnyAccessControl, sanctionsListAccessControl, yopWalletAccount } = await setupVault(
      WETH_ADDRESS
    ));
    [user] = (await ethers.getSigners()).reverse();
    const ERC1155AccessControlFactory = await ethers.getContractFactory("ERC1155AccessControl");
    erc1155AccessControl = (await ERC1155AccessControlFactory.deploy(governance.address)) as ERC1155AccessControl;
    await erc1155AccessControl.deployed();
    await erc1155AccessControl.connect(governance).addGlobalNftAccess([YOP_NFT_CONTRACT_ADDRESS], [YOP_NFT_IDS]);
    // remove the default policy
    await accessManager.connect(governance).removeAccessControlPolicies([allowAnyAccessControl.address]);
    await accessManager.connect(governance).addAccessControlPolicies([erc1155AccessControl.address]);
    await vault.connect(governance).unpause();
    yopNftHolder = await impersonate(YOP_NFT_WHALE_ADDRESS);
    // send some weth to the user
    wethContract = (await ethers.getContractAt(IWethABI, WETH_ADDRESS)) as IWETH;
    await setEthBalance(WETH_WHALE_ADDRESS, ethers.utils.parseEther("10"));
    await setEthBalance(YOP_NFT_WHALE_ADDRESS, ethers.utils.parseEther("10"));
    await wethContract.connect(await impersonate(WETH_WHALE_ADDRESS)).transfer(user.address, ethers.utils.parseEther("100"));
    await wethContract.connect(await impersonate(WETH_WHALE_ADDRESS)).transfer(yopNftHolder.address, ethers.utils.parseEther("100"));
    await wethContract.connect(user).approve(vault.address, ethers.constants.MaxUint256);
    await wethContract.connect(yopNftHolder).approve(vault.address, ethers.constants.MaxUint256);
    yopContract = (await ethers.getContractAt(ERC20ABI, CONST.TOKENS.YOP.ADDRESS)) as ERC20;
    await yopContract.connect(yopWalletAccount).transfer(user.address, ONE_THOUSAND_YOP);
    await yopContract.connect(yopWalletAccount).transfer(yopNftHolder.address, ONE_THOUSAND_YOP);
    await yopContract.connect(user).approve(yopStaking.address, ethers.constants.MaxUint256);
    await yopContract.connect(yopNftHolder).approve(yopStaking.address, ethers.constants.MaxUint256);
  });

  describe("SanctionsList", async () => {
    it("should add sanctionsList to block policies", async () => {
      const blockPoliciesBefore = await accessManager.getBlockControlPolicies();
      expect(blockPoliciesBefore.length).to.equal(0);
      await accessManager.connect(governance).addBlockControlPolicies([sanctionsListAccessControl.address]);
      const blockPoliciesAfter = await accessManager.getBlockControlPolicies();
      expect(blockPoliciesAfter[0]).to.equal(sanctionsListAccessControl.address);
    });
    it("should be blocked from sanctioned address", async () => {
      await accessManager.connect(governance).addBlockControlPolicies([sanctionsListAccessControl.address]);
      expect(await accessManager.hasAccess(SANCTIONED_ADDRESS, vault.address)).to.be.equal(false);
    });
    it("should be blocked on vaults from sanctioned address", async () => {
      const sanctionedWallet = await impersonate(SANCTIONED_ADDRESS);
      await setEthBalance(sanctionedWallet.address, ethers.utils.parseEther("10"));
      await wethContract.connect(await impersonate(WETH_WHALE_ADDRESS)).transfer(sanctionedWallet.address, ethers.utils.parseEther("100"));
      await accessManager.connect(governance).addBlockControlPolicies([sanctionsListAccessControl.address]);
      await expect(vault.connect(sanctionedWallet).deposit(depositAmount, SANCTIONED_ADDRESS)).to.be.revertedWith("!access");
    });
    it("should be blocked on stake from sanctioned address", async () => {
      const sanctionedWallet = await impersonate(SANCTIONED_ADDRESS);
      await setEthBalance(sanctionedWallet.address, ethers.utils.parseEther("10"));
      await yopContract.connect(yopWalletAccount).transfer(sanctionedWallet.address, ONE_THOUSAND_YOP);
      await accessManager.connect(governance).addBlockControlPolicies([sanctionsListAccessControl.address]);
      await expect(yopStaking.connect(sanctionedWallet).stake(ONE_THOUSAND_YOP, 3)).to.be.revertedWith("!access");
    });
  });
  describe("check access with YOP NFT", async () => {
    it("should revert if user does not own any of the NFTs when deposit to a vault", async () => {
      await expect(vault.connect(user).deposit(depositAmount, user.address)).to.be.revertedWith("!access");
    });

    it("should revert if user does not own any of the NFTs when staking", async () => {
      await expect(yopStaking.connect(user).stake(ONE_THOUSAND_YOP, 3)).to.be.revertedWith("!access");
    });

    it("YOP nft holder can deposit to vault", async () => {
      await expect(vault.connect(yopNftHolder).deposit(depositAmount, user.address)).not.to.be.reverted;
    });

    it("YOP nft holder can stake to vault", async () => {
      await expect(yopStaking.connect(yopNftHolder).stake(ONE_THOUSAND_YOP, 3)).not.to.be.reverted;
    });
  });

  describe("check open access", async () => {
    beforeEach(async () => {
      await allowAnyAccessControl.connect(governance).setDefault(true);
      await accessManager.connect(governance).addAccessControlPolicies([allowAnyAccessControl.address]);
    });

    it("users without NFT can access vaults or staking contract", async () => {
      await expect(vault.connect(user).deposit(depositAmount, user.address)).not.to.be.reverted;
      await expect(yopStaking.connect(user).stake(ONE_THOUSAND_YOP, 3)).not.to.be.reverted;
    });
  });
});
