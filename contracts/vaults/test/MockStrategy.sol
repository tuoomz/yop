// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

contract MockStrategy {
  address public vault;

  // solhint-disable-next-line
  function migrate(address _newStrategy) external {}

  function setVault(address _vault) external {
    vault = _vault;
  }
}
