import { DeployCommonArgs, Wallet } from "../ContractDeployment";
import { VaultStrategyDataStoreDeployment } from "../VaultStrategyDataStoreDeployment";
import { ethers } from "hardhat";
import { ConvexV2StrategyConfig, CurvePool } from "./types";
import VaultABI from "../../../abi/contracts/vaults/SingleAssetVaultV2.sol/SingleAssetVaultV2.json";
import { SingleAssetVaultV2 } from "../../../types/SingleAssetVaultV2";
import { CurvePoolInfo } from "./CurvePoolInfo";
import { BaseStrategyDeployment } from "./BaseStrategyDeployment";

const DEFAULT_PROPOSER = ethers.constants.AddressZero;
const DEFAULT_DEVELOPER = ethers.constants.AddressZero;
const LDO_TOKEN_ADDRESS = "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32";

export class ConvexV2StrategyDeployment extends BaseStrategyDeployment {
  poolInfo: CurvePool;

  constructor(
    commonArgs: DeployCommonArgs,
    vault: string,
    vaultManager: Wallet,
    vaultStrategyDataStoreDeployment: VaultStrategyDataStoreDeployment,
    config: ConvexV2StrategyConfig
  ) {
    super(commonArgs, vault, vaultManager, vaultStrategyDataStoreDeployment, config);
    this.poolInfo = new CurvePoolInfo(config.pool_info);
  }

  async deployParams(): Promise<Array<any>> {
    const config = this.config as ConvexV2StrategyConfig;
    const gauge = await this.poolInfo.gauge;
    const vaultContract = (await ethers.getContractAt(VaultABI, this.vault)) as SingleAssetVaultV2;
    const vaultToken = await vaultContract.token();
    const tokenIndex = await this.poolInfo.token_index(vaultToken);
    const poolId = await this.poolInfo.convex_pool_id;
    if (this.contractName === "ConvexETHSinglePool") {
      if (tokenIndex === -1) {
        throw new Error(`can not load token index for token ${vaultToken} in pool ${this.poolInfo.pool}`);
      }
      return Promise.resolve([
        this.vault,
        DEFAULT_PROPOSER,
        DEFAULT_DEVELOPER,
        this.config.harvester,
        this.poolInfo.pool,
        gauge,
        tokenIndex,
        poolId,
        config.booster,
        LDO_TOKEN_ADDRESS,
      ]);
    } else if (this.contractName === "ConvexERC20SinglePool") {
      if (tokenIndex === -1) {
        throw new Error(`can not load token index for token ${vaultToken} in pool ${this.poolInfo.pool}`);
      }
      return Promise.resolve([
        this.vault,
        DEFAULT_PROPOSER,
        DEFAULT_DEVELOPER,
        this.config.harvester,
        this.poolInfo.pool,
        gauge,
        this.poolInfo.number_of_tokens,
        tokenIndex,
        vaultToken,
        this.poolInfo.is_zap_pool,
        poolId,
        config.booster,
      ]);
    } else if (this.contractName === "ConvexCurveMeta") {
      const basePool = await this.poolInfo.base_pool;
      if (!basePool) {
        throw new Error(`can not load base pool info for meta pool ${this.poolInfo.pool}`);
      }
      const basePoolInfo = new CurvePoolInfo({
        pool: basePool,
        type: "plain",
        number_of_tokens: 3,
      });
      const bLpToken = await basePoolInfo.lp_token;
      const bNoOfTokens = await basePoolInfo.number_of_tokens;
      const bTokenIndex = await basePoolInfo.token_index(vaultToken);
      if (bTokenIndex === -1) {
        throw new Error(`can not load token index for token ${vaultToken} in pool ${basePool}`);
      }
      const metaLpToken = await this.poolInfo.lp_token;
      return Promise.resolve([
        this.vault,
        DEFAULT_PROPOSER,
        DEFAULT_DEVELOPER,
        this.config.harvester,
        basePoolInfo.pool,
        bLpToken,
        this.poolInfo.pool,
        metaLpToken,
        bTokenIndex,
        bNoOfTokens,
        config.booster,
        poolId,
      ]);
    } else {
      throw new Error("unsupported contract name " + this.contractName);
    }
  }
}
