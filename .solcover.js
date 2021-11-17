module.exports = {
  skipFiles: ["mocks", "interfaces", "vaults/roles/Manageable.sol"],
  mocha: {
    grep: "@skip-on-coverage", // Find everything with this tag
    invert: true, // Run the grep's inverse set.
  },
};
