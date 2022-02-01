// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../staking/Staking.sol";

/// @notice This contract is deployed to Rinkeby to allow override the YOP token address as it is hardcoded by default.
contract StakingV1Mock is Staking {
  address public token;

  function setToken(address _token) external onlyGovernance {
    token = _token;
  }

  function _getYOPAddress() internal view override returns (address) {
    return token;
  }
}
