// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../staking/Staking.sol";

contract StakingMock is Staking {
  address public token;
  uint256 public blocktime;

  function setToken(address _token) external {
    token = _token;
  }

  function setBlocktime(uint256 _blocktime) external {
    blocktime = _blocktime;
  }

  function _getYOPAddress() internal view override returns (address) {
    super._getYOPAddress(); // for code coverage
    return token;
  }

  function _getBlockTimestamp() internal view override returns (uint256) {
    super._getBlockTimestamp(); // for code coverage
    return blocktime;
  }
}
