import hre from "hardhat";

export const CONSTANTS: any = {
  multisig: {
    mainnet: {
      yopGovernance: "0x457a60065050050B3e64Fcd96cFb973123D38338",
      yopGatekeeper: "0x5B6394Eb0C9Ac102fA5777D32Cd87151E894A940",
      yopManager: "0x65A7cDfd73d6f6A5bE6604521c8001FE2cE58f0D",
      yopStrategist: "0xEe06F6574856512Eae3c350972E056Df52e42b0D",
      yopHarvester: "0xE9CDD67b924a8e82709207373699bb749F8851CE",
    },
  },
  addresses: {
    mainnet: {
      yop_address: "0xAE1eaAE3F627AAca434127644371b67B18444051",
      // https://etherscan.io/address/0x53798aad04807e9795dd0d719637b4051e304931 - YOP Collection TODO - Verify this is right
      yop_nft_contract_address: "0x53798aad04807e9795dd0d719637b4051e304931",
      curveStEthPool: "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022",
    },
    rinkeby: {
      yop_nft_contract_address: "0x805758826868a767073bd313E301Ff2F4578E95D",
      yop_address: "0x805758826868a767073bd313E301Ff2F4578E95D",
      curveStEthPool: "0xa35Bed5d2F29653251e3Cf20905005F827b39a0e",
    },
    goerli: {
      yop_nft_contract_address: "0xCfA7af86c325a8050e3dFb9E5349f36cEB89Faf8",
      yop_address: "0xc40C64835D5f190348B18d823fA9A1149aEbd4d7",
      curveStEthPool: "0xa35Bed5d2F29653251e3Cf20905005F827b39a0e",
    },
  },
  token_addresses: {
    mainnet: {
      usdc: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      weth: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    },
    rinkeby: {
      usdc: "0xeb8f08a975ab53e34d8a0330e0d34de942c95926",
      weth: "0xc778417e063141139fce010982780140aa0cd5ab",
    },
    goerli: {
      usdc: "0xD87Ba7A50B2E7E660f678A895E4B72E7CB4CCd9C",
      weth: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
    },
  },
} as const;

export function fetchConstant(constantGroup: string, constantName: string) {
  const network = ["hardhat", "localhost"].includes(hre.network.name) ? "mainnet" : hre.network.name;
  try {
    return CONSTANTS[constantGroup][network][constantName];
  } catch (error) {
    console.log(`Constant lookup failed for group ${constantGroup} :: ${constantName}`);
    return "";
  }
}
