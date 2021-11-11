// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

interface IStrategy {
  // *** Events *** //
  event Harvested(uint256 _profit, uint256 _loss, uint256 _debtPayment, uint256 _debtOutstanding);
  event StrategistUpdated(address _newStrategist);
  event KeeperUpdated(address _newKeeper);
  event RewardsUpdated(address _rewards);
  event MinReportDelayUpdated(uint256 _delay);
  event MaxReportDelayUpdated(uint256 _delay);
  event ProfitFactorUpdated(uint256 _profitFactor);
  event DebtThresholdUpdated(uint256 _debtThreshold);
  event EmergencyExitEnabled();

  // *** The following functions are used by the Vault *** //
  /// @notice returns the address of the token that the strategy wants
  function want() external view returns (address);

  /// @notice the address of the Vault that the strategy belongs to
  function vault() external view returns (address);

  /// @notice if the strategy is active
  function isActive() external view returns (bool);

  /// @notice migrate the strategy to the new one
  function migrate(address _newStrategy) external;

  /// @notice withdraw the amount from the strategy
  function withdraw(uint256 _amount) external returns (uint256);

  /// @notice the amount of total assets managed by this strategy that should not acount towards the TVL of the strategy
  function delegatedAssets() external view returns (uint256);

  /// @notice the total assets that the strategy is managing
  function estimatedTotalAssets() external view returns (uint256);

  // *** public read functions that can be called by anyone *** //
  function name() external view returns (string memory);

  function keeper() external view returns (address);

  function strategist() external view returns (address);

  function tendTrigger(uint256 _callCost) external view returns (bool);

  function harvestTrigger(uint256 _callCost) external view returns (bool);

  // *** write functions that can be called by the govenance, the strategist or the keeper *** //
  function tend() external;

  function harvest() external;

  // *** write functions that can be called by the govenance or the strategist ***//
  function setStrategist(address _strategist) external;

  function setKeeper(address _keeper) external;

  function setRewards(address _rewards) external;

  function setVault(address _vault) external;

  /// @notice `minReportDelay` is the minimum number of blocks that should pass for `harvest()` to be called.
  function setMinReportDelay(uint256 _delay) external;

  function setMaxReportDelay(uint256 _delay) external;

  /// @notice `profitFactor` is used to determine if it's worthwhile to harvest, given gas costs.
  function setProfitFactor(uint256 _profitFactor) external;

  /// @notice Sets how far the Strategy can go into loss without a harvest and report being required.
  function setDebtThreshold(uint256 _debtThreshold) external;

  // *** write functions that can be called by the govenance, or the strategist, or the guardian, or the management *** //
  function setEmergencyExit() external;
}