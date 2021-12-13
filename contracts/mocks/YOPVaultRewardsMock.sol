// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../rewards/YOPVaultRewards.sol";

contract YOPVaultRewardsMock is YOPVaultRewards {
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
  uint256 internal blockTimestamp;

  // solhint-disable-next-line no-empty-blocks
  constructor() {}

  function setEpochStartTime(uint256 _startTime) external {
    emissionStartTime = _startTime;
  }

  function setEpochEndTime(uint256 _endTime) external {
    emissionEndTime = _endTime;
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
    yopContractAddress = _reward;
  }

  function _getBlockTimestamp() internal view override returns (uint256) {
    return blockTimestamp;
  }

  function version() external pure returns (string memory) {
    return "2.0.0";
  }
}
