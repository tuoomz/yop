// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "./StakingV1Mock.sol";

/// @dev This is used to deploy the initial version of the staking contract, and the storage layout is different from the StakingV2 contracts.
///  During upgrade, it will throw an error complaining about the storage layout.
///  To solve it, the `Staking.sol` file should be updated with the following changes:
///  1. Add the `token` field
///  2. Add the `__gap` field
///  3. Change `_getYOPAddress` to return `token`
///  Compile the contracts and then upgrade.
///  However, do not check in these changes.
contract StakingV1Mock2 is StakingV1Mock {
  function setOwner(address _owner) external onlyGovernance {
    owner = _owner;
  }

  function setURI(string calldata _uri) external onlyGovernance {
    _setURI(_uri);
  }

  uint256[50] private __gap;
}
