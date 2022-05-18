/* eslint-disable camelcase */
import { ethers } from "hardhat";
import { ICurveRegistry } from "../../../types";
import { CurvePool, CurveV2DeploymentConfig } from "./types";
import CurveRegistryABI from "../../../abi/contracts/interfaces/curve/ICurveRegistry.sol/ICurveRegistry.json";
import CurveZapPoolABI from "../../../test/abis/curvePoolZapDepositor.json";
import CurvePlainPoolABI from "../../../test/abis/curvePlainPool.json";
import CurveMetaPoolABI from "../../../test/abis/curveMetaPool.json";
import { readJSONFile, sameString } from "../../util";

const CURVE_REGISTRY_ADDRESS = "0x90E00ACe148ca3b23Ac1bC8C240C2a7Dd9c2d7f5";
const CONVEX_POOL_INFO_FILE = "deployments/convex-pools.json";
const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const CURVE_ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

let convexPoolInfo: Record<string, any>;
export class CurvePoolInfo implements CurvePool {
  public type: string;
  public pool: string;
  public number_of_tokens: number;
  public is_zap_pool: boolean;
  public is_meta_pool: boolean;
  private _lp_token?: string;
  private _gauge?: string;
  private _convex_pool_id?: number;
  private _base_pool?: string;
  private _input_token_index?: number;

  constructor(config: CurveV2DeploymentConfig) {
    this.type = config.type;
    this.pool = config.pool;
    this.number_of_tokens = config.number_of_tokens;
    this.is_zap_pool = this.type === "zap";
    this.is_meta_pool = this.type === "meta";
    this._lp_token = config.lp_token;
    this._gauge = config.gauge;
    this._convex_pool_id = config.convex_pool_id;
    if (config.base_pool) {
      this._base_pool = config.base_pool;
    }
    if (typeof config.input_token_index !== "undefined") {
      this._input_token_index = config.input_token_index;
    }
  }

  public get lp_token(): Promise<string> {
    if (this._lp_token) {
      return Promise.resolve(this._lp_token);
    }
    if (this.type === "plain" || this.type === "meta") {
      return (async () => {
        const registry = await this.getCurveRegistry();
        this._lp_token = await registry.get_lp_token(this.pool);
        return this._lp_token;
      })();
    } else if (this.type === "zap") {
      return (async () => {
        const zapPool = await ethers.getContractAt(CurveZapPoolABI, this.pool);
        const result = await zapPool.pool();
        const registry = await this.getCurveRegistry();
        this._lp_token = await registry.get_lp_token(result);
        return this._lp_token;
      })();
    }
    throw new Error("unsupported pool type " + this.type);
  }

  public get gauge(): Promise<string> {
    if (this._gauge) {
      return Promise.resolve(this._gauge);
    } else if (this.type === "plain" || this.type === "meta") {
      return (async () => {
        const registry = await this.getCurveRegistry();
        this._gauge = (await registry.get_gauges(this.pool))[0][0];
        return this._gauge;
      })();
    } else if (this.type === "zap") {
      return (async () => {
        const zapPool = await ethers.getContractAt(CurveZapPoolABI, this.pool);
        const result = await zapPool.pool();
        const registry = await this.getCurveRegistry();
        this._gauge = (await registry.get_gauges(result))[0][0];
        return this._gauge;
      })();
    }
    throw new Error("unsupported pool type " + this.type);
  }

  public get convex_pool_id(): Promise<number> {
    if (this._convex_pool_id) {
      return Promise.resolve(this._convex_pool_id);
    } else {
      return (async () => {
        const poolInfo = await this.loadConvexPoolInfo();
        const lpToken = (await this.lp_token).toLowerCase();
        if (typeof poolInfo[lpToken] !== "undefined") {
          return poolInfo[lpToken].poolId;
        } else {
          throw new Error(`can not determine convex pool id for pool ${this.pool}`);
        }
      })();
    }
  }

  public get base_pool(): Promise<string> {
    if (this._base_pool) {
      return Promise.resolve(this._base_pool!);
    } else {
      return (async () => {
        if (this.is_meta_pool) {
          const metaPool = await ethers.getContractAt(CurveMetaPoolABI, this.pool);
          this._base_pool = await metaPool.base_pool();
          return this._base_pool!;
        }
        throw new Error(`no base pool for pool ${this.pool} with type ${this.type}`);
      })();
    }
  }

  public async token_index(token: string): Promise<number> {
    if (typeof this._input_token_index !== "undefined") {
      return this._input_token_index;
    }
    if (this.type === "plain" || this.type === "meta") {
      const pool = await ethers.getContractAt(CurvePlainPoolABI, this.pool);
      // plain pools should have 2 or 3 tokens and meta pools have 2 tokens
      for (let i = 0; i < 4; i++) {
        try {
          const tokenAddress = await pool.coins(i);
          if (sameString(tokenAddress, token)) {
            return i;
          } else if (sameString(token, WETH_ADDRESS) && sameString(CURVE_ETH_ADDRESS, tokenAddress)) {
            // if the token is WETH, it could be that the pool wants ETH, check if that's the case
            return i;
          }
        } catch (err) {
          // no more tokens and we haven't found a match
          return -1;
        }
      }
    } else if (this.type === "zap") {
      // zap pools normally take 4 tokens, the first is the additional token of the meta pool, and the rest are the tokens of the base pool
      const pool = await ethers.getContractAt(CurveZapPoolABI, this.pool);
      const firstToken = await pool.coins(0);
      if (sameString(firstToken, token)) {
        return 0;
      }
      for (let i = 0; i < 3; i++) {
        const tokenAddress = await pool.base_coins(i);
        if (sameString(tokenAddress, token)) {
          return i + 1;
        }
      }
      return -1;
    }
    throw new Error("unsupported pool type " + this.type);
  }

  private async getCurveRegistry(): Promise<ICurveRegistry> {
    return (await ethers.getContractAt(CurveRegistryABI, CURVE_REGISTRY_ADDRESS)) as ICurveRegistry;
  }

  private async loadConvexPoolInfo(): Promise<Record<string, any>> {
    if (!convexPoolInfo) {
      const data = await readJSONFile(CONVEX_POOL_INFO_FILE);
      if (!data.poolLength) {
        throw new Error(
          `no data available from ${CONVEX_POOL_INFO_FILE}. Please run "./scripts/fetch-convex-pools.ts" first to fetch convex pools`
        );
      }
      convexPoolInfo = data.pools;
    }
    return convexPoolInfo;
  }
}
