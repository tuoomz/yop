// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./roles/Governable.sol";
import "./roles/Manageable.sol";
import "./roles/Gatekeeperable.sol";
import "./StrategyManager.sol";
import "../access/AccessControlManager.sol";

// the Vault itself also represents an ERC20 token, which means it also inherits all methods that are available on the ERC20 interface.
// This token is the shares that the users will get when they deposit money into the Vault
interface IBaseVault is IERC20, IERC20Permit {
  /// @notice when the vault was created
  function activation() external view returns (uint256);

  /// @notice the address of the rewards account
  function rewards() external view returns (address);

  /// @notice the management fee in basis points.
  function managementFee() external view returns (uint256);

  /// @notice if the vault is in emergencyShutdown mode
  function emergencyShutdown() external view returns (bool);

  /// @notice the address of a health check contract address
  function healthCheck() external view returns (address);

  /// @notice degradation for locked profit per second
  function lockedProfitDegradation() external view returns (uint256);

  function setRewards(address _rewards) external;

  function setManagementFee(uint256 _managementFee) external;

  function setLockedProfileDegradation(uint256 _degradation) external;

  function setEmergencyShutdown(bool _active) external;

  function setHealthCheck(address _healthCheck) external;

  function addStrategy(
    address _strategy,
    uint256 _debtRatio,
    uint256 _minDebtPerHarvest,
    uint256 _maxDebtPerHarvest,
    uint256 _performanceFee
  ) external;

  function updateStrategyPerformanceFee(address _strategy, uint256 _performanceFee) external;

  function updateStrategyDebtRatio(address _strategy, uint256 _debtRatio) external;

  function updateStrategyMinDebtHarvest(address _strategy, uint256 _minDebtPerHarvest) external;

  function updateStrategyMaxDebtHarvest(address _strategy, uint256 _maxDebtPerHarvest) external;

  function setWithdrawQueue(address[] calldata _queue) external;

  function addStrategyToWithdrawQueue(address _strategy) external;

  function removeStrategyFromWithdrawQueue(address _strategy) external;

  function migrateStrategy(address _oldVersion, address _newVersion) external;

  function revokeStrategy(address _strategy) external;
}

/// @dev This contract is marked abstract to avoid being used directly.
abstract contract BaseVault is IBaseVault, ERC20Permit, Manageable, Gatekeeperable, Governable, StrategyManager {
  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  event EmergencyShutdown(bool _active);
  event HealthCheckUpdated(address indexed _healthCheck);
  event RewardsUpdated(address _rewards);
  event ManagementFeeUpdated(uint256 _managementFee);

  // ### Vault base properties
  uint8 internal vaultDecimals;

  /// @notice timestamp for when the vault is deployed
  uint256 public activation;
  /// @notice the management fee of the vault in basis points, which is calculated based on the TVL of the vault. 1 basis point is 0.01%.
  uint256 public managementFee; // no management fee by default
  /// @notice rewards contract to send the fees collected
  address public rewards;

  uint256 public constant DEGRADATION_COEFFICIENT = 10**18;
  /// @notice degradation for locked profit per second
  /// @dev the value is based on 6-hour degradation period (1/(60*60*6) = 0.000046)
  ///   NOTE: This is being deprecated by Yearn. See https://github.com/yearn/yearn-vaults/pull/471
  uint256 public lockedProfitDegradation = DEGRADATION_COEFFICIENT.mul(46).div(10**6);

  /// @notice if the vault is in emergency shutdown mode.
  bool public emergencyShutdown = false;
  address public healthCheck;

  /// @dev ensure the vault is not in emergency shutdown mode
  modifier onlyNotEmergencyShutdown() {
    require(emergencyShutdown == false, "emergency shutdown");
    _;
  }

  /// @dev check msg.send is either the governance, or management or the given strategy
  modifier onlyAdminOrStrategy(address _strategy) {
    require(_msgSender() == governance || _msgSender() == manager || _msgSender() == _strategy, "no permission");
    _;
  }

  /// @dev BaseVault constructor. The deployer will be set as the governance of the vault by default.
  /// @param _name the name of the vault
  /// @param _symbol the symbol of the vault
  /// @param _decimals vault decimals
  /// @param _managementFeeBPS basis points for the management fee. 1 basis point is 0.01% and 100% is 10000 basis points.
  /// @param _rewards the address to send the collected fees to
  /// @param _manager the address of the manager of the vault
  /// @param _gatekeeper the address of the guardian of the valut
  constructor(
    string memory _name,
    string memory _symbol,
    uint8 _decimals,
    uint256 _managementFeeBPS,
    address _rewards,
    address _manager,
    address _gatekeeper
  )
    ERC20Permit(_name)
    ERC20(_name, _symbol)
    Manageable(_manager)
    Gatekeeperable(_gatekeeper)
    Governable()
    StrategyManager()
  {
    vaultDecimals = _decimals;
    _updateRewards(_rewards);
    _updateManagementFee(_managementFeeBPS);
    activation = block.timestamp;
  }

  /// @notice returns decimals value of the vault
  function decimals() public view override returns (uint8) {
    return vaultDecimals;
  }

  /// @notice set the wallet address to send the collected fees to. Only can be called by the governance.
  /// @param _rewards the new wallet address to send the fees to.
  function setRewards(address _rewards) external {
    _onlyGoverance();
    _updateRewards(_rewards);
  }

  /// @notice set the management fee in basis points. 1 basis point is 0.01% and 100% is 10000 basis points.
  function setManagementFee(uint256 _managementFee) external {
    _onlyGoverance();
    _updateManagementFee(_managementFee);
  }

  /// @notice Changes the locked profit degradation.
  /// @param _degradation The rate of degradation in percent per second scaled to 1e18.
  function setLockedProfileDegradation(uint256 _degradation) external {
    _onlyGoverance();
    require(_degradation <= DEGRADATION_COEFFICIENT, "degradation value is too large");
    lockedProfitDegradation = _degradation;
  }

  function setHealthCheck(address _healthCheck) external {
    _onlyGovernanceOrManager();
    require(_healthCheck != address(0), "invalid address");
    healthCheck = _healthCheck;
    emit HealthCheckUpdated(_healthCheck);
  }

  function setManager(address _manager) external {
    _onlyGoverance();
    _updateManager(_manager);
  }

  function setGatekeeper(address _gatekeeper) external {
    _onlyGoverance();
    _updateGatekeeper(_gatekeeper);
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
  function setEmergencyShutdown(bool _active) external {
    if (_active) {
      require(_msgSender() == gatekeeper || _msgSender() == governance, "only gatekeeper or governance");
    } else {
      require(_msgSender() == governance, "only governance");
    }
    emergencyShutdown = _active;
    emit EmergencyShutdown(_active);
  }

  /// @notice add the given strategy to the vault
  /// @param _strategy the address of the strategy contract
  /// @param _debtRatio the percentage of the asset in the vault that will be allocated to the strategy, in basis points (1 BP is 0.01%).
  /// @param _minDebtPerHarvest lower limit on the increase of debt since last harvest
  /// @param _maxDebtPerHarvest upper limit on the increase of debt since last harvest
  /// @param _performanceFee the fee that the strategist will receive based on the strategy's performance. In basis points.
  function addStrategy(
    address _strategy,
    uint256 _debtRatio,
    uint256 _minDebtPerHarvest,
    uint256 _maxDebtPerHarvest,
    uint256 _performanceFee
  ) external onlyNotEmergencyShutdown {
    _onlyGoverance();
    _addStrategy(_strategy, _debtRatio, _minDebtPerHarvest, _maxDebtPerHarvest, _performanceFee);
  }

  /// @notice update the performance fee of the given strategy
  /// @param _strategy the address of the strategy contract
  /// @param _performanceFee the new performance fee in basis points
  function updateStrategyPerformanceFee(address _strategy, uint256 _performanceFee) external {
    _onlyGoverance();
    _updateStrategyPerformanceFee(_strategy, _performanceFee);
  }

  /// @notice update the debt ratio for the given strategy
  /// @param _strategy the address of the strategy contract
  /// @param _debtRatio the new debt ratio of the strategy in basis points
  function updateStrategyDebtRatio(address _strategy, uint256 _debtRatio) external {
    _onlyGovernanceOrManager();
    _updateStrategyDebtRatio(_strategy, _debtRatio);
  }

  /// @notice update the minDebtHarvest for the given strategy
  /// @param _strategy the address of the strategy contract
  /// @param _minDebtPerHarvest the new minDebtPerHarvest value
  function updateStrategyMinDebtHarvest(address _strategy, uint256 _minDebtPerHarvest) external {
    _onlyGovernanceOrManager();
    _updateStrategyMinDebtHarvest(_strategy, _minDebtPerHarvest);
  }

  /// @notice update the maxDebtHarvest for the given strategy
  /// @param _strategy the address of the strategy contract
  /// @param _maxDebtPerHarvest the new maxDebtPerHarvest value
  function updateStrategyMaxDebtHarvest(address _strategy, uint256 _maxDebtPerHarvest) external {
    _onlyGovernanceOrManager();
    _updateStrategyMaxDebtHarvest(_strategy, _maxDebtPerHarvest);
  }

  /// @notice updates the withdrawalQueue to match the addresses and order specified by `queue`.
  ///  There can be fewer strategies than the maximum, as well as fewer than
  ///  the total number of strategies active in the vault.
  ///  This may only be called by governance or management.
  /// @dev This is order sensitive, specify the addresses in the order in which
  ///  funds should be withdrawn (so `queue`[0] is the first Strategy withdrawn
  ///  from, `queue`[1] is the second, etc.)
  ///  This means that the least impactful Strategy (the Strategy that will have
  ///  its core positions impacted the least by having funds removed) should be
  ///  at `queue`[0], then the next least impactful at `queue`[1], and so on.
  /// @param _queue The array of addresses to use as the new withdrawal queue. This is order sensitive.
  function setWithdrawQueue(address[] calldata _queue) external {
    _onlyGovernanceOrManager();
    _setWithdrawQueue(_queue);
  }

  /// @notice add the strategy to the `withdrawQueue`
  /// @dev the strategy will only be appended to the `withdrawQueue`
  /// @param _strategy the strategy to add
  function addStrategyToWithdrawQueue(address _strategy) external {
    _onlyGovernanceOrManager();
    _addStrategyToWithdrawQueue(_strategy);
  }

  /// @notice remove the strategy from the `withdrawQueue`
  /// @dev we don't do this with revokeStrategy because it should still be possible to withdraw from the Strategy if it's unwinding.
  /// @param _strategy the strategy to remove
  function removeStrategyFromWithdrawQueue(address _strategy) external {
    _onlyGovernanceOrManager();
    _removeStrategyFromWithdrawQueue(_strategy);
  }

  /// @notice Migrate a Strategy, including all assets from `oldVersion` to `newVersion`. This may only be called by governance.
  /// @dev Strategy must successfully migrate all capital and positions to new Strategy, or else this will upset the balance of the Vault.
  ///  The new Strategy should be "empty" e.g. have no prior commitments to
  ///  this Vault, otherwise it could have issues.
  /// @param _oldVersion the existing strategy to migrate from
  /// @param _newVersion the new strategy to migrate to
  function migrateStrategy(address _oldVersion, address _newVersion) external {
    _onlyGoverance();
    _migrateStrategy(_oldVersion, _newVersion);
  }

  /// @notice Revoke a Strategy, setting its debt limit to 0 and preventing any future deposits.
  ///  This function should only be used in the scenario where the Strategy is
  ///  being retired but no migration of the positions are possible, or in the
  ///  extreme scenario that the Strategy needs to be put into "Emergency Exit"
  ///  mode in order for it to exit as quickly as possible. The latter scenario
  ///  could be for any reason that is considered "critical" that the Strategy
  ///  exits its position as fast as possible, such as a sudden change in market
  ///  conditions leading to losses, or an imminent failure in an external
  ///  dependency.
  ///  This may only be called by governance, the guardian, or the Strategy
  ///  itself. Note that a Strategy will only revoke itself during emergency
  ///  shutdown.
  /// @param _strategy The Strategy to revoke.
  function revokeStrategy(address _strategy) external onlyAdminOrStrategy(_strategy) {
    if (strategies[_strategy].debtRatio != 0) {
      _revokeStrategy(_strategy);
    }
  }

  function _onlyGovernanceOrGatekeeper() internal view {
    require((_msgSender() == governance) || (_msgSender() == gatekeeper), "governance or gatekeepers only");
  }

  function _onlyGovernanceOrManager() internal view {
    require((_msgSender() == governance) || (_msgSender() == manager), "governance or manager only");
  }

  function _updateRewards(address _rewards) internal {
    require(_rewards != address(0), "rewards address is not valid");
    require(_rewards != rewards, "already the rewards");
    rewards = _rewards;
    emit RewardsUpdated(rewards);
  }

  function _updateManagementFee(uint256 _managementFee) internal {
    require(_managementFee < MAX_BASIS_POINTS, "invalid management fee");
    managementFee = _managementFee;
    emit ManagementFeeUpdated(managementFee);
  }

  /// @notice send the tokens that are not managed by the vault to the governance
  /// @param _token the token to send
  /// @param _amount the amount of tokens to send
  function _sweep(address _token, uint256 _amount) internal {
    IERC20 token = IERC20(_token);
    if (_amount == type(uint256).max) {
      _amount = token.balanceOf(address(this));
    }
    token.safeTransfer(governance, _amount);
  }
}
