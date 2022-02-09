import { BigNumber } from "ethers";
import hre, { ethers } from "hardhat";
import { readDeploymentFile } from "../util";
import { ContractDeploymentCall, DeploymentRecord, ContractFunctionCall, Wallet, DefaultWallet, MultisigWallet } from "./ContractDeployment";
import { deployContract } from "../deploy-contract";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { proposeTxn, proposeTxns } from "../gnosis/propose-txn";
export class Executor {
  dryRun: boolean;
  env: string;

  constructor(env: string, dryRun: boolean) {
    this.env = env;
    this.dryRun = dryRun;
  }

  async executeDeployments(deployments: Array<ContractDeploymentCall>) {
    const deploymentRecords: Record<string, DeploymentRecord> = await readDeploymentFile(this.env);
    if (this.dryRun) {
      let totalEstimatedGas: BigNumber = BigNumber.from("0");
      for (const d of deployments) {
        console.log(`>>>>>> Deploy Contract <<<<<<`);
        console.log(`name         : ${d.name}`);
        console.log(`contractName : ${d.contractName}`);
        const params = this.processParams(deploymentRecords, d.params);
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
      for (const d of deployments) {
        await this.doDeploy(d);
      }
    }
  }

  async executeFunctions(calls: Array<ContractFunctionCall>) {
    const deploymentRecords: Record<string, DeploymentRecord> = await readDeploymentFile(this.env);
    if (this.dryRun) {
      let totalEstimatedGas: BigNumber = BigNumber.from("0");
      for (const c of calls) {
        if (this.isMultisigWallet(c.signer)) {
          console.log(`>>>>>> Call Contract Function <<<<<<`);
          console.log(`address      : ${c.address}`);
          console.log(`method       : ${c.methodName}`);
          const params = this.processParams(deploymentRecords, c.params);
          c.params = params;
          console.log(`params       : ${JSON.stringify(params)}`);
          console.log(`message      : can not estimate gas cost for calls with a multisig wallet`);
        } else {
          console.log(`>>>>>> Call Contract Function <<<<<<`);
          console.log(`address      : ${c.address}`);
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
        console.log(`>>>>>> Call Contract Function Start <<<<<<`);
        console.log(`address      : ${c.address}`);
        console.log(`method       : ${c.methodName}`);
        const params = this.processParams(deploymentRecords, c.params);
        c.params = params;
        console.log(`params       : ${JSON.stringify(params)}`);
        if (!this.isMultisigWallet(c.signer)) {
          await this.doContractCall(c);
          console.log(`>>>>>> Call Contract Function Complete <<<<<<`);
        } else {
          multisigCounters++;
          const multisig = c.signer as MultisigWallet;
          if (multisigTrans[multisig.address]) {
            multisigTrans[multisig.address].push(c);
          } else {
            multisigTrans[multisig.address] = [c];
          }
        }
      }
      if (multisigCounters > 0) {
        await this.proposeMultiSendTx(multisigTrans);
      }
    }
  }

  private async getEstimatedGasForDeployment(deployment: ContractDeploymentCall): Promise<BigNumber> {
    const factory = await ethers.getContractFactory(deployment.contractName);
    const deployTrans = await factory.getDeployTransaction(...deployment.params);
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

  private async doDeploy(deployment: ContractDeploymentCall) {
    const deploymentRecords = await readDeploymentFile(this.env);
    const params = this.processParams(deploymentRecords, deployment.params);
    console.log("deploying contract " + deployment.contractName + "with params", params);
    await deployContract(this.env, deployment.name, deployment.contractName, deployment.upgradeable, ...params);
  }

  private async doContractCall(call: ContractFunctionCall) {
    if (this.isMultisigWallet(call.signer)) {
      return await this.proposeMultisigTx(call);
    } else {
      const signer = await this.getSigner(call.signer);
      const contract = await ethers.getContractAt(call.abi, call.address);
      await contract.connect(signer)[call.methodName](...call.params);
    }
  }

  private isMultisigWallet(wallet: Wallet): boolean {
    return wallet.type === "multisig";
  }

  private async getSigner(wallet: Wallet): Promise<SignerWithAddress> {
    if (wallet.type === "default") {
      const w = wallet as DefaultWallet;
      const signers = await ethers.getSigners();
      return Promise.resolve(signers[w.index]);
    } else {
      throw new Error("unsupported wallet type " + wallet.type);
    }
  }

  private async proposeMultisigTx(call: ContractFunctionCall) {
    const multisigWallet = call.signer as MultisigWallet;
    const safeAddress = multisigWallet.address;
    await proposeTxn(safeAddress, call.address, call.methodName, JSON.stringify(call.params), "", hre, call.abi);
  }

  private async proposeMultiSendTx(calls: Record<string, ContractFunctionCall[]>) {
    const safes = Object.keys(calls);
    for (const safe of safes) {
      const trans = calls[safe];
      await proposeTxns(safe, trans, hre);
    }
  }
}
