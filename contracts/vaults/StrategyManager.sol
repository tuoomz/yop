// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../interfaces/Strategy.sol";

/// @dev Provides common functionalities to manage strategies.
///  Note that almost all functions in this contract are internal and they do not have any access control.
///  This is deliberate and it's up to the implementation contract to expose the approriate functions externally and apply access control.
abstract contract StrategyManager is Context {
  using SafeMath for uint256;

  /// @notice parameters associated with a strategy
  struct StrategyParams {
    uint256 performanceFee;
    uint256 activation;
    uint256 debtRatio;
    uint256 minDebtPerHarvest;
    uint256 maxDebtPerHarvest;
    uint256 lastReport;
    uint256 totalDebt;
    uint256 totalGain;
    uint256 totalLoss;
  }

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
  event StrategyMigrated(address indexed _old, address indexed _new);
  event StrategyRevoked(address indexed _strategy);
  event StrategyRemovedFromQueue(address indexed _strategy);
  event StrategyAddedToQueue(address indexed _strategy);
  event MaxTotalRatioUpdated(uint256 _maxTotalDebtRatio);

  /// @notice The maximum basis points. 1 basis point is 0.01% and 100% is 10000 basis points
  uint256 public constant MAX_BASIS_POINTS = 10_000;

  uint256 public maxTotalDebtRatio = 9500;

  /// @notice the addresses of strategies for the Vault
  mapping(address => StrategyParams) public strategies;

  /// @notice maximum number of strategies allowed for the withdraw queue
  uint256 public constant MAX_STRATEGIES = 20;

  /// @notice the ordering that `withdraw` uses to determine wich strategies to pull funds from
  address[] public withdrawQueue;

  /// @notice the total ratio of all strategies. It should not exceed `MAX_BASIS_POINTS`.
  uint256 public totalDebtRatio;

  function _setMaxTotalDebtRatio(uint256 _maxTotalDebtRatio) internal {
    require(_maxTotalDebtRatio <= MAX_BASIS_POINTS, "invalid value");
    maxTotalDebtRatio = _maxTotalDebtRatio;
    emit MaxTotalRatioUpdated(_maxTotalDebtRatio);
  }

  function _addStrategy(
    address _strategy,
    uint256 _debtRatio,
    uint256 _minDebtPerHarvest,
    uint256 _maxDebtPerHarvest,
    uint256 _performanceFee
  ) internal {
    require(_strategy != address(0), "strategy address is not valid");
    require(withdrawQueue.length < MAX_STRATEGIES, "too many strategies");
    require(strategies[_strategy].activation == 0, "strategy already added");
    require(IStrategy(_strategy).vault() == address(this), "wrong vault");
    require(_minDebtPerHarvest <= _maxDebtPerHarvest, "invalid minDebtPerHarvest value");
    require(totalDebtRatio + _debtRatio <= maxTotalDebtRatio, "total debtRatio over limit");
    require(_performanceFee <= MAX_BASIS_POINTS.div(2), "invalid performance fee");

    strategies[_strategy] = StrategyParams({
      performanceFee: _performanceFee,
      activation: block.timestamp,
      debtRatio: _debtRatio,
      minDebtPerHarvest: _minDebtPerHarvest,
      maxDebtPerHarvest: _maxDebtPerHarvest,
      lastReport: block.timestamp,
      totalDebt: 0,
      totalGain: 0,
      totalLoss: 0
    });

    emit StrategyAdded(_strategy, _debtRatio, _minDebtPerHarvest, _maxDebtPerHarvest, _performanceFee);
    totalDebtRatio += _debtRatio;
    withdrawQueue.push(_strategy);
  }

  function _updateStrategyPerformanceFee(address _strategy, uint256 _performanceFee) internal {
    require(_performanceFee <= MAX_BASIS_POINTS.div(2), "invalid performance fee");
    _validateStrategy(_strategy);
    strategies[_strategy].performanceFee = _performanceFee;
    emit StrategyPerformanceFeeUpdated(_strategy, _performanceFee);
  }

  function _updateStrategyDebtRatio(address _strategy, uint256 _debtRatio) internal {
    _validateStrategy(_strategy);
    totalDebtRatio = totalDebtRatio.sub(strategies[_strategy].debtRatio);
    strategies[_strategy].debtRatio = _debtRatio;
    totalDebtRatio = totalDebtRatio.add(_debtRatio);
    require(totalDebtRatio <= maxTotalDebtRatio, "debtRatio over limit");
    emit StrategyDebtRatioUpdated(_strategy, _debtRatio);
  }

  function _updateStrategyMinDebtHarvest(address _strategy, uint256 _minDebtPerHarvest) internal {
    _validateStrategy(_strategy);
    require(strategies[_strategy].maxDebtPerHarvest >= _minDebtPerHarvest, "invalid minDebtPerHarvest");
    strategies[_strategy].minDebtPerHarvest = _minDebtPerHarvest;
    emit StrategyMinDebtPerHarvestUpdated(_strategy, _minDebtPerHarvest);
  }

  function _updateStrategyMaxDebtHarvest(address _strategy, uint256 _maxDebtPerHarvest) internal {
    _validateStrategy(_strategy);
    require(strategies[_strategy].minDebtPerHarvest <= _maxDebtPerHarvest, "invalid maxDebtPerHarvest");
    strategies[_strategy].maxDebtPerHarvest = _maxDebtPerHarvest;
    emit StrategyMaxDebtPerHarvestUpdated(_strategy, _maxDebtPerHarvest);
  }

  function _setWithdrawQueue(address[] calldata _queue) internal {
    require(_queue.length <= MAX_STRATEGIES, "invalid queue size");
    uint256 oldQueueSize = withdrawQueue.length;
    for (uint256 i = 0; i < _queue.length; i++) {
      address temp = _queue[i];
      require(strategies[temp].activation > 0, "invalid queue");
      if (i > withdrawQueue.length - 1) {
        withdrawQueue.push(temp);
      } else {
        withdrawQueue[i] = temp;
      }
    }
    if (oldQueueSize > _queue.length) {
      for (uint256 j = oldQueueSize; j > _queue.length; j--) {
        withdrawQueue.pop();
      }
    }
    emit WithdrawQueueUpdated(_queue);
  }

  function _addStrategyToWithdrawQueue(address _strategy) internal {
    _validateStrategy(_strategy);
    require(withdrawQueue.length + 1 <= MAX_STRATEGIES, "too many strategies");
    for (uint256 i = 0; i < withdrawQueue.length; i++) {
      require(withdrawQueue[i] != _strategy, "strategy already exist");
    }
    withdrawQueue.push(_strategy);
    emit StrategyAddedToQueue(_strategy);
  }

  function _removeStrategyFromWithdrawQueue(address _strategy) internal {
    _validateStrategy(_strategy);
    uint256 idx = 0;
    for (uint256 i = 0; i < withdrawQueue.length; i++) {
      if (withdrawQueue[i] == _strategy) {
        idx = i;
        break;
      }
    }
    require(idx < withdrawQueue.length, "strategy does not exist");
    for (uint256 j = idx; j < withdrawQueue.length; j++) {
      withdrawQueue[j] = withdrawQueue[j + 1];
    }
    withdrawQueue.pop();
    emit StrategyRemovedFromQueue(_strategy);
  }

  function _migrateStrategy(address _oldStrategy, address _newStrategy) internal {
    _validateStrategy(_oldStrategy);
    require(_newStrategy != address(0), "invalid new strategy");
    require(strategies[_newStrategy].activation == 0, "new strategy already exists");

    StrategyParams memory params = strategies[_oldStrategy];
    _revokeStrategy(_oldStrategy);
    // _revokeStrategy will reduce the debt ratio
    totalDebtRatio += params.debtRatio;
    strategies[_oldStrategy].totalDebt = 0;

    strategies[_newStrategy] = StrategyParams({
      performanceFee: params.performanceFee,
      activation: params.activation,
      debtRatio: params.debtRatio,
      minDebtPerHarvest: params.minDebtPerHarvest,
      maxDebtPerHarvest: params.maxDebtPerHarvest,
      lastReport: params.lastReport,
      totalDebt: params.totalDebt,
      totalGain: 0,
      totalLoss: 0
    });

    IStrategy(_oldStrategy).migrate(_newStrategy);
    emit StrategyMigrated(_oldStrategy, _newStrategy);
    for (uint256 i = 0; i < withdrawQueue.length; i++) {
      if (withdrawQueue[i] == _oldStrategy) {
        withdrawQueue[i] = _newStrategy;
      }
    }
  }

  function _revokeStrategy(address _strategy) internal {
    totalDebtRatio = totalDebtRatio.sub(strategies[_strategy].debtRatio);
    strategies[_strategy].debtRatio = 0;
    emit StrategyRevoked(_strategy);
  }

  function _validateStrategy(address _strategy) internal view {
    require(strategies[_strategy].activation > 0, "invalid strategy");
  }
}
