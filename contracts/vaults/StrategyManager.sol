// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "./Governable.sol";
import "./Guardianable.sol";

interface IStrategyManager {
  /// @notice parameters associated with a strategy
  struct StrategyParams {
    uint256 performanceFee;
    uint256 activation;
    uint256 debtRation;
    uint256 minDebtPerHarvest;
    uint256 maxDebtPerHarvest;
    uint256 lastReport;
    uint256 totalDebt;
    uint256 totalGain;
    uint256 totalLoss;
  }
}

contract StrategyManager is Governable, Guardianable, IStrategyManager {
  // *** Events (not including events from ERC20) *** //
  event StrategyAdded(
    address indexed _strategyAddress,
    uint256 _debtRatio,
    uint256 _minDebtPerHarvest,
    uint256 _maxDebtPerHarvest,
    uint256 _performanceFee
  );
  event StrategyReported(
    address indexed _strategyAddress,
    uint256 _gain,
    uint256 _loss,
    uint256 _debtPaid,
    uint256 _totalGain,
    uint256 _totalLoss,
    uint256 _totalDebt,
    uint256 _debtAdded,
    uint256 _debtRatio
  );

  event WithdrawQueueUpdated(address[] _queue);
  event StrategyDebtRatioUpdated(address indexed _strategy, uint256 _debtRatio);
  event StrategyMinDebtPerHarvestUpdated(address indexed _strategy, uint256 _minDebtPerHarvest);
  event StrategyMaxDebtPerHarvestUpdated(address indexed _strategy, uint256 _maxDebtPerHarvest);
  event StrategyPerformanceFeeUpdated(address indexed _strategy, uint256 _performanceFee);
  event StrategyMigrated(address indexed _old, address indexed, address _new);
  event StrategyRevoked(address indexed _strategy);
  event StrategyRemovedFromQueue(address indexed _strategy);
  event StrategyAddedToQueue(address indexed _strategy);

  // ### Strategies related
  /// @dev maximum number of strategies allowed for the withdraw queue
  uint256 constant MAX_STRATEGIES = 20;

  /// @dev the addresses of strategies for the Vault
  mapping(address => StrategyParams) private strategies;

  /// @dev the ordering that `withdraw` uses to determine wich strategies to pull funds from
  ///      should be determined by the ?
  address[MAX_STRATEGIES] private withdrawQueue;

  /// @notice get the details for a given strategy
  function strategyParams(address strategy) external view returns (StrategyParams memory) {}

  /// @notice return the position of the given strategy in the withdrawQueue
  function strategyWithdrawQueue(address strategy) external view returns (uint256) {}

  function addStrategy(
    address _strategy,
    uint256 _debtRation,
    uint256 _minDebtPerHarvest,
    uint256 _maxDebtPerHarvest,
    uint256 _performanceFee,
    uint256 _profitLimitRatio,
    uint256 _lossLimitRatio
  ) external {}

  function updateStrategyPerformance(address _strategy, uint256 _performanceFee) external {}

  function migrateStrategy(address _oldStrategy, address _newStrategy) external {}

  // *** The following are write functions that can only be called by the govenance or the management *** //
  function setWithdrawQueue(address[] calldata _queue) external {}

  function updateStrategyDebtRatio(address _strategy, uint256 _debtRation) external {}

  function updateStrategyMinDebtHarvest(address _strategy, uint256 _minDebtPerHarvest) external {}

  function updateStrategyMaxDebtHarvest(address _strategy, uint256 _maxDebtPerHarvest) external {}

  function addStrategyToWithdrawQueue(address _strategy) external {}

  function removeStrategyFromWithdrawQueue(address _strategy) external {}

  function revokeStrategy(address strategy) external {}

  /// @notice sum of all strategies' debt ratio settings
  function debtRatio() external view returns (uint256) {}

  /// @notice the timestamp of the last time a strategy reported back
  function lastReport() external view returns (uint256) {}
}
