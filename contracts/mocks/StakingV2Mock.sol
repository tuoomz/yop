// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../staking/StakingV2.sol";

contract StakingV2Mock is StakingV2 {
  address public token;

  function setToken(address _token) external {
    token = _token;
  }

  function _getYOPAddress() internal view override returns (address) {
    return token;
  }
}
