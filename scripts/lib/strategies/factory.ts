import hre from "hardhat";
export function getStrategyDeployment(contract: string, version: string): string {
  if (hre.network.name === "rinkeby") {
    if (!contract.startsWith("Testnet")) {
      console.warn(`non-mock strategy ${contract} is going to be deployed to rinkeby, but it won't work and may fail`);
    }
  }
  if (contract.startsWith("Curve")) {
    if (version.toString() === "1") {
      return "CurveV1StrategyDeployment";
    } else if (version.toString() === "2") {
      return "CurveV2StrategyDeployment";
    } else {
      throw new Error(`unsupported version ${version} for contract ${contract}`);
    }
  } else if (contract.startsWith("Convex")) {
    if (version.toString() === "1") {
      return "ConvexV1StrategyDeployment";
    } else if (version.toString() === "2") {
      return "ConvexV2StrategyDeployment";
    } else {
      throw new Error(`unsupported version ${version} for contract ${contract}`);
    }
  } else if (contract.startsWith("Testnet")) {
    return "MockStrategyDeployment";
  } else {
    throw new Error(`no strategy found for ${contract} and version ${version}`);
  }
}
