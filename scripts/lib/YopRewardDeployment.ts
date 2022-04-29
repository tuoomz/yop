import { BaseConfig, ContractDeploymentUpdate, ContractFunctionCall, DeployCommonArgs, Wallet } from "./ContractDeployment";
import YOPRewardsABI from "../../abi/contracts/rewards/YOPRewards.sol/YOPRewards.json";
import { ethers } from "hardhat";
import { YOPRewards } from "../../types/YOPRewards";

export interface YopRewardsDeploymentConfig extends BaseConfig {
  governance: Wallet;
  gatekeeper: Wallet;
  wallet: string;
  // eslint-disable-next-line camelcase
  yop_contract: string;
  // eslint-disable-next-line camelcase
  emission_start_time: number;
  // eslint-disable-next-line camelcase
  total_allocation_weight: Record<string, number>;
  // eslint-disable-next-line camelcase
  vaults_allocation_weight: Record<string, number>;
  paused: boolean;
}

type YopRewardsCurrentState = {
  paused: boolean;
  vaultRewardsWeight: number;
  stakingRewardsWeight: number;
  perVaultWeight: Record<string, number>;
  stakingContractAddress: string;
};

export class YopRewardDeployment extends ContractDeploymentUpdate {
  name = "YOPRewards";
  contractName = "YOPRewardsV2";
  upgradeable = true;
  config: YopRewardsDeploymentConfig;

  constructor(commonArgs: DeployCommonArgs, config: YopRewardsDeploymentConfig) {
    super(commonArgs, config.version);
    this.config = config;
  }

  async deployParams(): Promise<Array<any>> {
    return Promise.resolve([
      await this.getWalletAddress(this.config.governance),
      await this.getWalletAddress(this.config.gatekeeper),
      this.config.wallet,
      this.config.yop_contract,
      this.config.emission_start_time,
    ]);
  }

  async getCurrentState(address: string): Promise<any> {
    if (address) {
      const contract = (await ethers.getContractAt(YOPRewardsABI, address)) as YOPRewards;
      const paused = await contract.paused();
      const weightForVaults = await contract.vaultsRewardsWeight();
      const weightForStaking = await contract.stakingRewardsWeight();
      const stakingContract = await contract.stakingContract();
      const vaultNames = Object.keys(this.config.vaults_allocation_weight);
      const perVaultWeight: Record<string, number> = {};
      for (const v of vaultNames) {
        let weight = ethers.constants.Zero;
        const address = await this.getAddressByName(v);
        if (address) {
          weight = await contract.perVaultRewardsWeight(address);
        }
        perVaultWeight[v] = weight.toNumber();
      }
      return {
        paused: paused,
        vaultRewardsWeight: weightForVaults.toNumber(),
        stakingRewardsWeight: weightForStaking.toNumber(),
        perVaultWeight: perVaultWeight,
        stakingContractAddress: stakingContract,
      };
    }
    return undefined;
  }

  async updateState(address: string, currentState: any): Promise<Array<ContractFunctionCall>> {
    const results = new Array<ContractFunctionCall>();
    let currentPaused;
    let currentVaultRewardsWeight;
    let currentStakingRewardsWeight;
    let currentPerVaultWeight;
    let currentStakingContract;
    if (currentState) {
      const s = currentState as YopRewardsCurrentState;
      currentPaused = s.paused;
      currentVaultRewardsWeight = s.vaultRewardsWeight;
      currentStakingRewardsWeight = s.stakingRewardsWeight;
      currentPerVaultWeight = s.perVaultWeight;
      currentStakingContract = s.stakingContractAddress;
    }
    const wantStakingContractAddress = await this.getAddressByName("Staking");
    if (wantStakingContractAddress !== currentStakingContract) {
      results.push({
        address: address,
        abi: YOPRewardsABI,
        methodName: "setStakingContractAddress",
        params: [wantStakingContractAddress],
        signer: this.config.governance,
      });
    }
    if (currentPaused !== this.config.paused) {
      results.push({
        address: address,
        abi: YOPRewardsABI,
        methodName: this.config.paused ? "pause" : "unpause",
        params: [],
        signer: this.config.governance,
      });
    }
    if (
      currentVaultRewardsWeight !== this.config.total_allocation_weight.vaults ||
      currentStakingRewardsWeight !== this.config.total_allocation_weight.staking
    ) {
      results.push({
        address: address,
        abi: YOPRewardsABI,
        methodName: "setRewardsAllocationWeights",
        params: [this.config.total_allocation_weight.vaults, this.config.total_allocation_weight.staking],
        signer: this.config.governance,
      });
    }
    let shouldUpdatePerVaultWeight = false;
    const vaults = Object.keys(this.config.vaults_allocation_weight);
    for (let i = 0; i < vaults.length; i++) {
      if (!currentPerVaultWeight || currentPerVaultWeight[vaults[i]] !== this.config.vaults_allocation_weight[vaults[i]]) {
        shouldUpdatePerVaultWeight = true;
        break;
      }
    }
    if (shouldUpdatePerVaultWeight) {
      const vaultAddresses: string[] = [];
      const weights: number[] = [];
      vaults.forEach(async (v) => {
        const address = await this.getAddressByNameOrRandom(v);
        vaultAddresses.push(address);
        weights.push(this.config.vaults_allocation_weight[v]);
      });
      results.push({
        address: address,
        abi: YOPRewardsABI,
        methodName: "setPerVaultRewardsWeight",
        params: [vaultAddresses, weights],
        signer: this.config.governance,
      });
    }
    return Promise.resolve(results);
  }

  async upgradeSigner(): Promise<Wallet | undefined> {
    return this.config.governance;
  }
}
