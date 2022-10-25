// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../staking/StakingV2.sol";

contract StakingV2Mock is StakingV2 {
  uint256 public blockTime;

  /// @notice Initialize the contract.
  /// @param _governance the governance address
  /// @param _gatekeeper the gatekeeper address
  /// @param _yopRewards the address of the yop rewards contract
  /// @param _uri the base URI for the token
  function initialize(
    string memory _name,
    string memory _symbol,
    address _governance,
    address _gatekeeper,
    address _yopRewards,
    string memory _uri,
    string memory _contractURI,
    address _owner,
    address _accessControlManager
  ) external virtual override initializer {
    __ReentrancyGuard_init();
    __Staking_init(
      _name,
      _symbol,
      _governance,
      _gatekeeper,
      _yopRewards,
      _uri,
      _contractURI,
      _owner,
      _accessControlManager
    );
  }

  function setBlockTime(uint256 _blockTime) external {
    blockTime = _blockTime;
  }

  function _getBlockTimestamp() internal view override returns (uint256) {
    return blockTime;
  }
}
