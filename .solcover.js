module.exports = {
  skipFiles: ["mocks", "interfaces", "vaults/roles/Manageable.sol"],
  mocha: {
    grep: "@skip-on-coverage", // Find everything with this tag
    invert: true, // Run the grep's inverse set.
  },
  // this is needed to resolve the "stack too deep" compiler errors
  // also needs to enable ABIEncoderV2 to actually generate the coverage report when this is enabled
  configureYulOptimizer: true,
};
