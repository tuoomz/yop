// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./roles/Governable.sol";
import "./roles/Gatekeeperable.sol";

contract VaultMetaDataStore is Context, Governable, Gatekeeperable {
  using SafeMath for uint256;

  event EmergencyShutdown(bool _active);
  event HealthCheckUpdated(address indexed _healthCheck);
  event RewardsUpdated(address indexed _rewards);
  event ManagementFeeUpdated(uint256 _managementFee);
  event StrategyDataStoreUpdated(address indexed _strategyDataStore);
  event DepositLimitUpdated(uint256 _limit);
  event LockedProfitDegradationUpdated(uint256 _degradation);

  /// @notice The maximum basis points. 1 basis point is 0.01% and 100% is 10000 basis points
  uint256 internal constant MAX_BASIS_POINTS = 10_000;
  uint256 internal constant DEGRADATION_COEFFICIENT = 10**18;
  uint256 public managementFee;
  /// @notice degradation for locked profit per second
  /// @dev the value is based on 6-hour degradation period (1/(60*60*6) = 0.000046)
  ///   NOTE: This is being deprecated by Yearn. See https://github.com/yearn/yearn-vaults/pull/471
  uint256 public lockedProfitDegradation = DEGRADATION_COEFFICIENT.mul(46).div(10**6);
  uint256 public depositLimit = type(uint256).max;
  address public rewards;
  address public healthCheck;
  address public strategyDataStore;
  bool public emergencyShutdown;

  constructor(
    address _governanace,
    address _gatekeeper,
    address _rewards,
    address _strategyDataStore
  ) Governable(_governanace) Gatekeeperable(_gatekeeper) {
    _updateRewards(_rewards);
    _updateStrategyDataStore(_strategyDataStore);
  }

  /// @notice set the wallet address to send the collected fees to. Only can be called by the governance.
  /// @param _rewards the new wallet address to send the fees to.
  function setRewards(address _rewards) external onlyGovernance {
    require(_rewards != address(0), "rewards address is not valid");
    _updateRewards(_rewards);
  }

  /// @notice set the management fee in basis points. 1 basis point is 0.01% and 100% is 10000 basis points.
  function setManagementFee(uint256 _managementFee) external onlyGovernance {
    require(_managementFee < MAX_BASIS_POINTS, "invalid management fee");
    _updateManagementFee(_managementFee);
  }

  function setGatekeeper(address _gatekeeper) external onlyGovernance {
    require(_gatekeeper != address(0), "invalid gatekeeper");
    _updateGatekeeper(_gatekeeper);
  }

  function setStrategyDataStore(address _strategyDataStoreContract) external onlyGovernance {
    require(_strategyDataStoreContract != address(0), "invalid strategy manager");
    _updateStrategyDataStore(_strategyDataStoreContract);
  }

  function setHealthCheck(address _healthCheck) external {
    _onlyGovernanceOrGatekeeper();
    _updateHealthCheck(_healthCheck);
  }

  /// @notice Activates or deactivates Vault mode where all Strategies go into full withdrawal.
  /// During Emergency Shutdown:
  /// 1. No Users may deposit into the Vault (but may withdraw as usual.)
  /// 2. Governance may not add new Strategies.
  /// 3. Each Strategy must pay back their debt as quickly as reasonable to minimally affect their position.
  /// 4. Only Governance may undo Emergency Shutdown.
  ///
  /// See contract level note for further details.
  ///
  /// This may only be called by governance or the guardian.
  /// @param _active If true, the Vault goes into Emergency Shutdown. If false, the Vault goes back into Normal Operation.
  function setVaultEmergencyShutdown(bool _active) external {
    if (_active) {
      _onlyGovernanceOrGatekeeper();
    } else {
      _onlyGovernance();
    }
    if (emergencyShutdown != _active) {
      emergencyShutdown = _active;
      emit EmergencyShutdown(_active);
    }
  }

  /// @notice Changes the locked profit degradation.
  /// @param _degradation The rate of degradation in percent per second scaled to 1e18.
  function setLockedProfileDegradation(uint256 _degradation) external {
    _onlyGovernance();
    require(_degradation <= DEGRADATION_COEFFICIENT, "degradation value is too large");
    if (lockedProfitDegradation != _degradation) {
      lockedProfitDegradation = _degradation;
      emit LockedProfitDegradationUpdated(_degradation);
    }
  }

  function setDepositLimit(uint256 _limit) external {
    _onlyGovernanceOrGatekeeper();
    _updateDepositLimit(_limit);
  }

  function _onlyGovernanceOrGatekeeper() internal view {
    require((_msgSender() == governance) || (gatekeeper != address(0) && gatekeeper == _msgSender()), "not authorised");
  }

  function _updateRewards(address _rewards) internal {
    if (rewards != _rewards) {
      rewards = _rewards;
      emit RewardsUpdated(_rewards);
    }
  }

  function _updateManagementFee(uint256 _managementFee) internal {
    if (managementFee != _managementFee) {
      managementFee = _managementFee;
      emit ManagementFeeUpdated(_managementFee);
    }
  }

  function _updateHealthCheck(address _healthCheck) internal {
    if (healthCheck != _healthCheck) {
      healthCheck = _healthCheck;
      emit HealthCheckUpdated(_healthCheck);
    }
  }

  function _updateStrategyDataStore(address _strategyDataStore) internal {
    if (_strategyDataStore != address(0) && strategyDataStore != _strategyDataStore) {
      strategyDataStore = _strategyDataStore;
      emit StrategyDataStoreUpdated(_strategyDataStore);
    }
  }

  function _updateDepositLimit(uint256 _depositLimit) internal {
    if (depositLimit != _depositLimit) {
      depositLimit = _depositLimit;
      emit DepositLimitUpdated(_depositLimit);
    }
  }
}