// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../rewards/YOPVaultRewards.sol";

contract YOPVaultRewardsMock is YOPVaultRewards {
  using EnumerableSet for EnumerableSet.AddressSet;
  uint256 internal epochStartTime;
  uint256 internal epochEndTime;
  uint256 internal blockTimestamp;
  address internal rewardAddress;

  // solhint-disable-next-line no-empty-blocks
  constructor(address _governance, address _wallet) YOPVaultRewards(_governance, _wallet) {}

  function setEpochStartTime(uint256 _startTime) external {
    epochStartTime = _startTime;
  }

  function setEpochEndTime(uint256 _endTime) external {
    epochEndTime = _endTime;
  }

  function setBlocktimestamp(uint256 _blockTimestamp) external {
    blockTimestamp = _blockTimestamp;
  }

  function setInitialVaultWeights(address[] calldata _vaults, uint256[] calldata _weights) external {
    require(_vaults.length == _weights.length, "invalid input");
    for (uint256 i = 0; i < _vaults.length; i++) {
      address vault = _vaults[i];
      uint256 oldValue = perVaultRewardsWeight[vault];
      if (oldValue != _weights[i]) {
        perVaultRewardsWeight[vault] = _weights[i];
        totalWeight = totalWeight - oldValue + _weights[i];
        vaultAddresses.add(vault);
      }
    }
  }

  function setRewardAddress(address _reward) external {
    rewardAddress = _reward;
  }

  function _getYOPAddress() internal view override returns (address) {
    return rewardAddress;
  }

  function _getEpochStartTime() internal view override returns (uint256) {
    return epochStartTime;
  }

  function _getEpochEndTime() internal view override returns (uint256) {
    return epochEndTime;
  }

  function _getBlockTimestamp() internal view override returns (uint256) {
    return blockTimestamp;
  }
}
