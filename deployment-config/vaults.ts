import { fetchConstant } from "../constants";
export const VAULTS: any = {
  Stable_Vault: {
    vault_type: "SingleAssetVault",
    name: "STABLE",
    symbol: "SVault",
    vault_token: fetchConstant("token_addresses", "usdc"),
    strategies: [],
  },
  ETH_Vault: {
    vault_type: "SingleAssetVault",
    name: "ETH",
    symbol: "EVault",
    vault_token: fetchConstant("token_addresses", "weth"),
    strategies: [
      {
        name: "CurveEth",
        additionalConstructorArgs: [fetchConstant("addresses", "curveStEthPool")],
      },
    ],
  },
} as const;
