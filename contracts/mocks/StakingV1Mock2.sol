// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "./StakingV1Mock.sol";

contract StakingV1Mock2 is StakingV1Mock {
  function setOwner(address _owner) external onlyGovernance {
    owner = _owner;
  }

  function setURI(string calldata _uri) external onlyGovernance {
    _setURI(_uri);
  }
}
