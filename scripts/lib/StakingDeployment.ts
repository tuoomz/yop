import { ContractDeploymentUpdate, ContractFunctionCall, Wallet, DeployCommonArgs, BaseConfig } from "./ContractDeployment";
import StakingABI from "../../abi/contracts/staking/Staking.sol/Staking.json";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { Staking } from "../../types/Staking";

export interface StakingDeploymentConfig extends BaseConfig {
  governance: Wallet;
  gatekeeper: Wallet;
  name: string;
  symbol: string;
  uri: string;
  // eslint-disable-next-line camelcase
  contract_uri: string;
  owner: string;
  // eslint-disable-next-line camelcase
  min_stake_amount: number;
  paused: boolean;
}

type StakingCurrentState = {
  paused: boolean;
  // eslint-disable-next-line camelcase
  min_stake_amount: BigNumber;
  // eslint-disable-next-line camelcase
  contract_uri: string;
  // eslint-disable-next-line camelcase
  access_control_manager: string;
};

export class StakingDeployment extends ContractDeploymentUpdate {
  name = "Staking";
  contractName = "StakingV2";
  upgradeable = true;
  config: StakingDeploymentConfig;

  constructor(commonArgs: DeployCommonArgs, config: StakingDeploymentConfig) {
    super(commonArgs, config.version);
    this.config = config;
  }

  async deployParams(): Promise<Array<any>> {
    return Promise.resolve([
      this.config.name,
      this.config.symbol,
      await this.getWalletAddress(this.config.governance),
      await this.getWalletAddress(this.config.gatekeeper),
      "$ADDRESS_FOR_YOPRewards",
      this.config.uri,
      this.config.contract_uri,
      this.config.owner,
      "$ADDRESS_FOR_AccessControlManager",
    ]);
  }

  async getCurrentState(address: string): Promise<any> {
    if (address) {
      const contract = (await ethers.getContractAt(StakingABI, address)) as Staking;
      const paused = await contract.paused();
      const minStakeAmount = await contract.minStakeAmount();
      const contractURI = await contract.contractURI();
      const accessManager = await contract.accessControlManager();
      return {
        paused: paused,
        min_stake_amount: minStakeAmount,
        contract_uri: contractURI,
        access_control_manager: accessManager,
      };
    }
    return undefined;
  }

  async updateState(address: string, currentState: any): Promise<Array<ContractFunctionCall>> {
    const results = new Array<ContractFunctionCall>();
    let currentPaused;
    let currentMinStakeAmount;
    let currentContractURI;
    let currentAccessControlManager;
    if (currentState) {
      const s = currentState as StakingCurrentState;
      currentPaused = s.paused;
      currentMinStakeAmount = s.min_stake_amount;
      currentContractURI = s.contract_uri;
      currentAccessControlManager = s.access_control_manager;
    }
    if (currentPaused !== this.config.paused) {
      results.push({
        address: address,
        abi: StakingABI,
        methodName: this.config.paused ? "pause" : "unpause",
        params: [],
        signer: this.config.governance,
      });
    }
    const wantMinStakeAmount = ethers.utils.parseUnits(this.config.min_stake_amount.toString(), 8);
    if (!currentMinStakeAmount || !currentMinStakeAmount.eq(wantMinStakeAmount)) {
      results.push({
        address: address,
        abi: StakingABI,
        methodName: "setMinStakeAmount",
        params: [wantMinStakeAmount],
        signer: this.config.governance,
      });
    }
    if (currentContractURI !== this.config.contract_uri) {
      results.push({
        address: address,
        abi: StakingABI,
        methodName: "setContractURI",
        params: [this.config.contract_uri],
        signer: this.config.governance,
      });
    }
    const latestAccessManger = await this.getAddressByName("AccessControlManager");
    if (currentAccessControlManager !== latestAccessManger) {
      results.push({
        address: address,
        abi: StakingABI,
        methodName: "setAccessControlManager",
        params: [latestAccessManger],
        signer: this.config.governance,
      });
    }
    return Promise.resolve(results);
  }

  async upgradeSigner(): Promise<Wallet | undefined> {
    return this.config.governance;
  }
}
