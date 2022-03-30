// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../staking/StakingV2.sol";

contract StakingV2Mock is StakingV2 {
  address public token;
  uint256 public blockTime;

  function setToken(address _token) external {
    token = _token;
  }

  function _getYOPAddress() internal view override returns (address) {
    return token;
  }

  function setBlockTime(uint256 _blockTime) external {
    blockTime = _blockTime;
  }

  function _getBlockTimestamp() internal view override returns (uint256) {
    return blockTime;
  }
}
