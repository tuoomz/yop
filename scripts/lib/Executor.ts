import { BigNumber } from "ethers";
import hre, { ethers } from "hardhat";
import { impersonate, readDeploymentFile, sameVersion } from "../util";
import { ContractDeploymentCall, DeploymentRecord, ContractFunctionCall, Wallet, DefaultWallet, MultisigWallet } from "./ContractDeployment";
import { deployContract, resetTotalGasUsed as resetDeployTotalGas, getTotalGasUsed as deployTotalUsedGas } from "../deploy-contract";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { proposeTxn, proposeTxns } from "../gnosis/propose-txn";
import { upgradeContract, resetTotalGasUsed as resetUpgradeTotalGas, getTotalGasUsed as upgradeTotalUsedGas } from "../upgrade-contract";
import { Libraries } from "hardhat/types";
export class Executor {
  dryRun: boolean;
  env: string;
  addressIndex?: Record<string, string>;

  constructor(env: string, dryRun: boolean) {
    this.env = env;
    this.dryRun = dryRun;
  }

  async executeDeployments(deployments: Array<ContractDeploymentCall>) {
    const deploymentRecords: Record<string, DeploymentRecord> = await readDeploymentFile(this.env);
    if (this.dryRun) {
      let totalEstimatedGas: BigNumber = BigNumber.from("0");
      const functionCalls = new Array<ContractFunctionCall>();
      for (const d of deployments) {
        console.log(`>>>>>> Deploy Contract <<<<<<`);
        console.log(`name         : ${d.name}`);
        console.log(`contractName : ${d.contractName}`);
        const params = this.processParams(deploymentRecords, d.params || []);
        d.params = params;
        let estimatedGas;
        console.log(`params       : ${JSON.stringify(params)}`);
        console.log(`upgradeable  : ${d.upgradeable}`);
        try {
          if (!d.upgradeable) {
            estimatedGas = await this.getEstimatedGasForDeployment(d);
          }
        } catch (e) {}
        console.log(`estimated gas: ${estimatedGas ? ethers.utils.formatUnits(estimatedGas, "gwei") : "N/A"}`);
        if (estimatedGas) {
          totalEstimatedGas = totalEstimatedGas.add(estimatedGas);
        }
      }
      console.log(">>>>>> Summary <<<<<<");
      console.log(`Total deployments  : ${deployments.length}`);
      console.log(`Total estimated gas: ${ethers.utils.formatUnits(totalEstimatedGas, "gwei")}`);
    } else {
      resetDeployTotalGas();
      resetUpgradeTotalGas();
      let functionCalls = new Array<ContractFunctionCall>();
      for (const d of deployments) {
        const calls = await this.doDeploy(d);
        functionCalls = functionCalls.concat(calls);
      }
      const gasUsed = deployTotalUsedGas() + upgradeTotalUsedGas();
      console.log(`Total gas used: ${gasUsed} GWEI`);
      const gasPrice = process.env.GAS_PRICE;
      if (gasPrice) {
        const cost = parseInt(gasPrice) * gasUsed;
        console.log(`Total gas cost: ${ethers.utils.formatUnits(cost, "gwei")} ETH`);
      }
      if (functionCalls.length > 0) {
        await this.executeFunctions(functionCalls);
      }
    }
  }

  async executeFunctions(calls: Array<ContractFunctionCall>) {
    const deploymentRecords: Record<string, DeploymentRecord> = await readDeploymentFile(this.env);
    if (this.dryRun) {
      let totalEstimatedGas: BigNumber = BigNumber.from("0");
      for (const c of calls) {
        const name = await this.getNameByAddress(c.address, deploymentRecords);
        if (this.isMultisigWallet(c.signer)) {
          console.log(`>>>>>> Call Contract Function <<<<<<`);
          console.log(`address      : ${c.address}`);
          console.log(`name         : ${name}`);
          console.log(`method       : ${c.methodName}`);
          const params = this.processParams(deploymentRecords, c.params);
          c.params = params;
          console.log(`params       : ${JSON.stringify(params)}`);
          console.log(`message      : can not estimate gas cost for calls with a multisig wallet`);
        } else {
          console.log(`>>>>>> Call Contract Function <<<<<<`);
          console.log(`address      : ${c.address}`);
          console.log(`name         : ${name}`);
          console.log(`method       : ${c.methodName}`);
          const params = this.processParams(deploymentRecords, c.params);
          c.params = params;
          console.log(`params       : ${JSON.stringify(params)}`);
          const estimatedGas = await this.getEstimatedGasForCall(c);
          totalEstimatedGas = totalEstimatedGas.add(estimatedGas);
          console.log(`estimated gas: ${ethers.utils.formatUnits(estimatedGas, "gwei")}`);
        }
      }
      console.log(">>>>>> Summary <<<<<<");
      console.log(`Total calls: ${calls.length}`);
      console.log(`Total estimated gas: ${ethers.utils.formatUnits(totalEstimatedGas, "gwei")}`);
    } else {
      const multisigTrans: Record<string, ContractFunctionCall[]> = {};
      let multisigCounters = 0;
      for (const c of calls) {
        const name = await this.getNameByAddress(c.address, deploymentRecords);
        console.log(`>>>>>> Call Contract Function Start <<<<<<`);
        console.log(`address      : ${c.address}`);
        console.log(`name         : ${name}`);
        console.log(`method       : ${c.methodName}`);
        const params = this.processParams(deploymentRecords, c.params);
        c.params = params;
        console.log(`params       : ${JSON.stringify(params)}`);
        if (this.isLocalNetwork()) {
          await this.doContractCall(c);
          console.log(`>>>>>> Call Contract Function Complete <<<<<<`);
        } else if (this.isMultisigWallet(c.signer)) {
          multisigCounters++;
          const multisig = c.signer as MultisigWallet;
          if (multisigTrans[multisig.address]) {
            multisigTrans[multisig.address].push(c);
          } else {
            multisigTrans[multisig.address] = [c];
          }
        } else {
          throw new Error(`unsupported signer ${c.signer} for network ${hre.network.name}`);
        }
      }
      if (multisigCounters > 0) {
        await this.proposeMultiSendTx(multisigTrans);
      }
    }
  }

  private async getEstimatedGasForDeployment(deployment: ContractDeploymentCall): Promise<BigNumber> {
    const factory = await ethers.getContractFactory(deployment.contractName);
    const deployTrans = await factory.getDeployTransaction(...deployment.params!);
    return ethers.provider.estimateGas(deployTrans);
  }

  private async getEstimatedGasForCall(call: ContractFunctionCall): Promise<BigNumber> {
    const signer = await this.getSigner(call.signer);
    const contract = await ethers.getContractAt(call.abi, call.address);
    return await contract.connect(signer).estimateGas[call.methodName](...call.params);
  }

  private processParams(deploymentRecords: Record<string, DeploymentRecord>, origParams: any[]): any[] {
    const params: any[] = [];
    for (let i = 0; i < origParams.length; i++) {
      const p = origParams[i];
      if (typeof p === "string") {
        if (p.startsWith("$ADDRESS_FOR_")) {
          const key = p.replace("$ADDRESS_FOR_", "");
          if (deploymentRecords[key] && deploymentRecords[key].address) {
            params.push(deploymentRecords[key].address);
          } else if (this.dryRun) {
            params.push(ethers.constants.AddressZero);
          } else {
            throw new Error("can not find address to replace " + p);
          }
        } else {
          params.push(p);
        }
      } else if (Array.isArray(p)) {
        params.push(this.processParams(deploymentRecords, p));
      } else {
        params.push(p.toString());
      }
    }
    return params;
  }

  private processLibaries(deploymentRecords: Record<string, DeploymentRecord>, origLibraries: Libraries): Libraries {
    const keys = Object.keys(origLibraries);
    const lib: Libraries = {};
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      let val = origLibraries[key];
      if (val.startsWith("$ADDRESS_FOR_")) {
        val = val.replace("$ADDRESS_FOR_", "");
        if (deploymentRecords[val] && deploymentRecords[val].address) {
          lib[key] = deploymentRecords[val].address;
        } else if (this.dryRun) {
          lib[key] = ethers.constants.AddressZero;
        } else {
          throw new Error(`can not find address for library ${val}`);
        }
      }
    }
    return lib;
  }

  private async doDeploy(deployment: ContractDeploymentCall): Promise<Array<ContractFunctionCall>> {
    const results = new Array<ContractFunctionCall>();
    const deploymentRecords = await readDeploymentFile(this.env);
    let libraries = deployment.libraries;
    if (libraries) {
      libraries = this.processLibaries(deploymentRecords, libraries);
    }
    if (deployment.isUpgrade) {
      console.log(`upgrading contract ${deployment.name} to version ${deployment.version}`);
      const upgradeCall = await upgradeContract(
        this.env,
        deployment.name,
        deployment.version,
        deployment.contractName,
        libraries,
        deployment.signer
      );
      if (upgradeCall) {
        results.push(upgradeCall);
      }
    } else {
      if (
        deploymentRecords[deployment.name] &&
        deploymentRecords[deployment.name].address &&
        sameVersion(deploymentRecords[deployment.name].version, deployment.version)
      ) {
        console.log(`ignore contract deployment for ${deployment.name} as it is already deployed`);
        return results;
      }
      const params = this.processParams(deploymentRecords, deployment.params || []);
      console.log(`deploying contract ${deployment.contractName} with params`, params);
      await deployContract(
        this.env,
        deployment.name,
        deployment.contractName,
        deployment.upgradeable,
        deployment.version,
        libraries,
        deployment.initializer,
        ...params
      );
    }
    return results;
  }

  private async doContractCall(call: ContractFunctionCall) {
    const signer = await this.getSigner(call.signer);
    const contract = await ethers.getContractAt(call.abi, call.address);
    await contract.connect(signer)[call.methodName](...call.params);
  }

  private isMultisigWallet(wallet: Wallet): boolean {
    return wallet.type === "multisig";
  }

  private isLocalNetwork(): boolean {
    return ["hardhat", "localhost"].indexOf(hre.network.name) > -1;
  }

  private async getSigner(wallet: Wallet): Promise<SignerWithAddress> {
    if (wallet.type === "default") {
      const w = wallet as DefaultWallet;
      const signers = await ethers.getSigners();
      return Promise.resolve(signers[w.index]);
    } else if (this.isLocalNetwork()) {
      const w = wallet as MultisigWallet;
      return await impersonate(w.address);
    } else {
      throw new Error("unsupported wallet type " + wallet.type);
    }
  }

  private async proposeMultiSendTx(calls: Record<string, ContractFunctionCall[]>) {
    const safes = Object.keys(calls);
    for (const safe of safes) {
      const trans = calls[safe];
      await proposeTxns(safe, trans, hre);
    }
  }

  private async getNameByAddress(address: string, deploymentRecords: Record<string, DeploymentRecord>) {
    if (!this.addressIndex) {
      this.addressIndex = {};
      const names = Object.keys(deploymentRecords);
      for (let i = 0; i < names.length; i++) {
        const addressRecord = deploymentRecords[names[i]].address;
        this.addressIndex[addressRecord] = names[i];
      }
    }
    return this.addressIndex[address];
  }
}
