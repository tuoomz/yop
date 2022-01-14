// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../staking/Staking.sol";

contract StakingMock is Staking {
  string public constant DEFAULT_URL = "https://example.com";
  address public token;
  uint256 public blocktime;

  constructor(
    address _governance,
    address _token,
    string memory _contractURI
  ) Staking(_governance, DEFAULT_URL, _contractURI) {
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
