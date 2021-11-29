// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

interface IYOPVaultRewards {
  /// @notice Returns the current emission rate (per epoch) for vault rewards and the current number of epoch (start from 1).
  function rate() external view returns (uint256 _rate, uint256 _epoch);

  /// @notice Returns the current percentage for vault users of the community rewards
  function vaultsRewardsRatio() external view returns (uint256);

  /// @notice Set the percentage for vault users of the community rewards. Governance only. Should emit an event.
  function setVaultsRewardsRatio(uint256 ratio) external;

  /// @notice Get the weight of a Vault
  function perVaultRewardsWeight(address vault) external view returns (uint256);

  /// @notice Set the weights for vaults. Governance only. Should emit events.
  function setPerVaultRewardsWeight(address[] calldata vaults, uint256[] calldata weights) external;

  /// @notice Calculate the rewards for the given user in the given vault. Vaults Only.
  /// This should be called by every Vault every time a user deposits or withdraws.
  function calculateRewards(address vault, address user) external;

  /// @notice Allow a user to claim the accrued rewards and transfer the YOP tokens to the given account.
  function claim(address[] calldata vaults, address to) external;
}
