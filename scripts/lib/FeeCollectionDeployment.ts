import { ContractDeploymentUpdate, ContractFunctionCall, Wallet, DeployCommonArgs, BaseConfig } from "./ContractDeployment";
import FeeCollectionABI from "../../abi/contracts/fees/FeeCollection.sol/FeeCollection.json";
import { ethers } from "hardhat";
import { FeeCollection } from "../../types/FeeCollection";

export interface FeeCollectionDeploymentConfig extends BaseConfig {
  governance: Wallet;
  gatekeeper: Wallet;
  // eslint-disable-next-line camelcase
  protocol_wallet: string;
  // eslint-disable-next-line camelcase
  default_vault_creator_fee_ratio: number;
  // eslint-disable-next-line camelcase
  default_strategy_proposer_fee_ratio: number;
  // eslint-disable-next-line camelcase
  default_strategy_developer_fee_ratio: number;
  paused: boolean;
}

type FeeCollectionCurrentState = {
  paused: boolean;
  // eslint-disable-next-line camelcase
  protocol_wallet: string;
  // eslint-disable-next-line camelcase
  default_vault_creator_fee_ratio: number;
  // eslint-disable-next-line camelcase
  default_strategy_proposer_fee_ratio: number;
  // eslint-disable-next-line camelcase
  default_strategy_developer_fee_ratio: number;
};

export class FeeCollectionDeployment extends ContractDeploymentUpdate {
  name = "FeeCollection";
  contractName = "FeeCollection";
  upgradeable = true;
  config: FeeCollectionDeploymentConfig;

  constructor(commonArgs: DeployCommonArgs, config: FeeCollectionDeploymentConfig) {
    super(commonArgs, config.version);
    this.config = config;
  }

  async deployParams(): Promise<Array<any>> {
    return Promise.resolve([
      await this.getWalletAddress(this.config.governance),
      await this.getWalletAddress(this.config.gatekeeper),
      this.config.protocol_wallet,
      "$ADDRESS_FOR_VaultStrategyDataStore",
      this.config.default_vault_creator_fee_ratio,
      this.config.default_strategy_proposer_fee_ratio,
      this.config.default_strategy_developer_fee_ratio,
    ]);
  }

  async getCurrentState(address: string): Promise<any> {
    if (address) {
      const contract = (await ethers.getContractAt(FeeCollectionABI, address)) as FeeCollection;
      const paused = await contract.paused();
      const protocolWalletAddress = await contract.protocolWallet();
      const defaultVaultCreatorRatio = await contract.defaultVaultCreatorFeeRatio();
      const defaultStraProposerRatio = await contract.defaultStrategyProposerFeeRatio();
      const defaultStraDeveloperRatio = await contract.defaultStrategyDeveloperFeeRatio();
      return {
        paused: paused,
        protocol_wallet: protocolWalletAddress,
        default_vault_creator_fee_ratio: defaultVaultCreatorRatio,
        default_strategy_proposer_fee_ratio: defaultStraProposerRatio,
        default_strategy_developer_fee_ratio: defaultStraDeveloperRatio,
      };
    }
    return undefined;
  }

  async updateState(address: string, currentState: any): Promise<Array<ContractFunctionCall>> {
    const results = new Array<ContractFunctionCall>();
    let currentPaused;
    let currentProtocolWallet;
    let currentDefaultVaultCreatorRatio;
    let currentStraProposerRatio;
    let currentStraDeveloperRatio;
    if (currentState) {
      const s = currentState as FeeCollectionCurrentState;
      currentPaused = s.paused;
      currentProtocolWallet = s.protocol_wallet;
      currentDefaultVaultCreatorRatio = s.default_vault_creator_fee_ratio;
      currentStraProposerRatio = s.default_strategy_proposer_fee_ratio;
      currentStraDeveloperRatio = s.default_strategy_developer_fee_ratio;
    }
    if (currentPaused !== this.config.paused) {
      results.push({
        address: address,
        abi: FeeCollectionABI,
        methodName: this.config.paused ? "pause" : "unpause",
        params: [],
        signer: this.config.governance,
      });
    }
    if (currentProtocolWallet !== this.config.protocol_wallet) {
      results.push({
        address: address,
        abi: FeeCollectionABI,
        methodName: "setProtocolWallet",
        params: [this.config.protocol_wallet],
        signer: this.config.governance,
      });
    }
    if (currentDefaultVaultCreatorRatio !== this.config.default_vault_creator_fee_ratio) {
      results.push({
        address: address,
        abi: FeeCollectionABI,
        methodName: "setDefaultVaultCreatorFeeRatio",
        params: [this.config.default_vault_creator_fee_ratio],
        signer: this.config.governance,
      });
    }
    if (
      currentStraProposerRatio !== this.config.default_strategy_proposer_fee_ratio ||
      currentStraDeveloperRatio !== this.config.default_strategy_developer_fee_ratio
    ) {
      results.push({
        address: address,
        abi: FeeCollectionABI,
        methodName: "setDefaultStrategyFeeRatio",
        params: [this.config.default_strategy_proposer_fee_ratio, this.config.default_strategy_developer_fee_ratio],
        signer: this.config.governance,
      });
    }
    return Promise.resolve(results);
  }

  async upgradeSigner(): Promise<Wallet | undefined> {
    return this.config.governance;
  }
}
