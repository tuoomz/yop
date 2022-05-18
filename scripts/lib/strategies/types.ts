import { BaseConfig } from "../ContractDeployment";
export interface CurvePool {
  type: string;
  pool: string;
  // eslint-disable-next-line camelcase
  number_of_tokens: number;
  gauge?: Promise<string>;
  // eslint-disable-next-line camelcase
  lp_token?: Promise<string>;
  // eslint-disable-next-line camelcase
  base_pool?: Promise<string>;
  // eslint-disable-next-line camelcase
  convex_pool_id?: Promise<number>;
  // eslint-disable-next-line camelcase
  token_index(token: string): Promise<number>;
  // eslint-disable-next-line camelcase
  is_zap_pool: boolean;
  // eslint-disable-next-line camelcase
  is_meta_pool: boolean;
}

export interface CommonStrategyConfig extends BaseConfig {
  name: string;
  contract: string;
  harvester: string;
  // eslint-disable-next-line camelcase
  performance_fee: number;
  allocation: number;
  // eslint-disable-next-line camelcase
  migrate_from: string;
  // eslint-disable-next-line camelcase
  min_debt_per_harvest: string;
  // eslint-disable-next-line camelcase
  max_debt_per_harvest: string;
  // eslint-disable-next-line camelcase
  emergency_exit: boolean;
}

export interface CurveV1StrategyConfig extends CommonStrategyConfig {
  pool: string;
}

export interface ConvexV1StrategyConfig extends CurveV1StrategyConfig {
  booster: string;
}

export interface CurveV2DeploymentConfig {
  type: string;
  pool: string;
  // eslint-disable-next-line camelcase
  number_of_tokens: number;
  gauge?: string;
  // eslint-disable-next-line camelcase
  lp_token?: string;
  // eslint-disable-next-line camelcase
  convex_pool_id?: number;
  // eslint-disable-next-line camelcase
  base_pool?: string;
  // eslint-disable-next-line camelcase
  input_token_index?: number;
}

export interface CurveV2StrategyConfig extends CommonStrategyConfig {
  // eslint-disable-next-line camelcase
  pool_info: CurveV2DeploymentConfig;
}

export interface ConvexV2StrategyConfig extends CurveV2StrategyConfig {
  booster: string;
}
