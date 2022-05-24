import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { SingleAssetVaultV2 } from "../../../types/SingleAssetVaultV2";
import { CONST } from "../../constants";
import { prepareUseAccount, setupVaultV2, reset } from "../shared/setup";
import ERC20ABI from "../../../abi/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol/ERC20Upgradeable.json";
import { ERC20, YOPRewardsV2 } from "../../../types";
import { StakingV2 } from "../../../types/StakingV2";

describe("Staking [@skip-on-coverage]", async () => {
  let vault: SingleAssetVaultV2;
  let governance: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let yopStaking: StakingV2;
  let yopRewards: YOPRewardsV2;
  let yopContract: ERC20;

  beforeEach(async () => {
    await reset(14212231);
    ({ vault, governance, yopStaking, yopRewards } = await setupVaultV2(CONST.TOKENS.USDC.ADDRESS));
    [user1, user2, user3] = (await ethers.getSigners()).reverse();
    await prepareUseAccount(
      user1,
      CONST.TOKENS.USDC.ADDRESS,
      CONST.TOKENS.USDC.WHALE,
      ethers.utils.parseUnits("100000", CONST.TOKENS.USDC.DECIMALS),
      vault.address,
      yopStaking.address
    );
    await prepareUseAccount(
      user2,
      CONST.TOKENS.USDC.ADDRESS,
      CONST.TOKENS.USDC.WHALE,
      ethers.utils.parseUnits("100000", CONST.TOKENS.USDC.DECIMALS),
      vault.address,
      yopStaking.address
    );
    await prepareUseAccount(
      user3,
      CONST.TOKENS.USDC.ADDRESS,
      CONST.TOKENS.USDC.WHALE,
      ethers.utils.parseUnits("100000", CONST.TOKENS.USDC.DECIMALS),
      vault.address,
      yopStaking.address
    );
    await vault.connect(governance).unpause();
    yopContract = (await ethers.getContractAt(ERC20ABI, CONST.TOKENS.YOP.ADDRESS)) as ERC20;
  });
  describe("verify staking safeTransfer", async () => {
    it("check safeTransfer from", async () => {
      await yopStaking.connect(user1).stake(ethers.utils.parseUnits("1000", 8), 1);
      const user1Stakes = (await yopStaking.stakesFor(user1.address))[0];
      await yopStaking.connect(user2).stake(ethers.utils.parseUnits("1000", 8), 1);
      const user2Stakes = (await yopStaking.stakesFor(user2.address))[0];
      await expect(yopStaking.connect(user1).safeBatchTransferFrom(user1.address, user1.address, [user2Stakes], [0], [])).to.be.revertedWith(
        "!amount"
      );
      await expect(yopStaking.connect(user1).safeTransferFrom(user1.address, user1.address, user2Stakes, 0, [])).to.be.revertedWith("!amount");
      await expect(yopStaking.connect(user1).safeBatchTransferFrom(user1.address, user1.address, [user2Stakes], [1], [])).to.be.revertedWith(
        "!allowed"
      );
      await expect(yopStaking.connect(user1).safeTransferFrom(user1.address, user1.address, user2Stakes, 1, [])).to.be.revertedWith("!allowed");
      await yopStaking.connect(user1).safeTransferFrom(user1.address, user2.address, user1Stakes, 1, []);
    });
  });
});
