// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./Manageable.sol";
import "./Guardianable.sol";
import "./StrategyManager.sol";
import "../access/AccessControlManager.sol";

// the Vault itself also represents an ERC20 token, which means it also inherits all methods that are available on the ERC20 interface.
// This token is the shares that the users will get when they deposit money into the Vault
interface IBaseVault {
  event EmergencyShutdown(bool _active);

  // *** The following are read functions and can be called by anyone *** //
  // some basic information about the vault
  function decimal() external view returns (uint256);

  function rewards() external view returns (address);

  function managementFee() external view returns (uint256);

  function performanceFee() external view returns (uint256);

  /// @notice if the vault is in emergencyShutdown mode
  function emergencyShutdown() external view returns (bool);

  /// @notice when the vault was created
  function activation() external view returns (uint256);

  function setRewards(address _rewards) external;

  function setPerformanceFee(uint256 _performanceFee) external;

  function setManagementFee(uint256 _managementFee) external;

  function setLockedProfileDegradation(uint256 _degradation) external;

  /// @notice remove tokens that are not managed by the Vault to the govenance account
  function sweep(address _token, uint256 _amount) external;

  // *** The following are write functions that can only be called by the govenance or the guardian *** //
  function setEmergencyShutdown(bool _active) external;
}

abstract contract BaseVault is
  IBaseVault,
  ERC20Permit,
  Manageable,
  Guardianable,
  StrategyManager,
  AccessControlManager
{
  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  event RewardsUpdated(address _rewards);
  event PerformanceFeeUpdated(uint256 _performance);
  event ManagementFeeUpdated(uint256 _managementFee);

  uint256 public activation;
  /// ### Management related
  ///@dev 1 basis point is 0.01% and 100% is 10000 basis points
  uint256 public constant MAX_BASIS_POINTS = 10_000;
  uint256 public managementFee = 0; // no management fee by default
  /// @dev fees collected from the strategies
  uint256 public performanceFee = 200; // 2% performance fee by default
  /// @dev rewards contract to send the fees collected
  address public rewards;

  // ### Vault base properties
  uint8 private vaultDecimals;

  uint256 public constant DEGRADATION_COEFFICIENT = 10**18;
  uint256 public lockedProfitDegradation = (DEGRADATION_COEFFICIENT * 46) / 10**6; //degradation for locked profit in seconds. If the degradation period is 6 hours then every second is (1/(60*60*6) = 0.000046).

  bool public emergencyShutdown = false;

  /// @dev BaseVault constructor. The deployer will be set as the governance, management and guardian of the vault by default.
  /// @param _name the name of the vault
  /// @param _symbol the symbol of the vault
  /// @param _decimals vault decimals
  /// @param _performanceFeeBPS basis points for the performance fee. 1 basis point is 0.01% and 100% is 10000 basis points.
  /// @param _managementFeeBPS basis points for the management fee. 1 basis point is 0.01% and 100% is 10000 basis points.
  /// @param _rewards the address to send the collected fees to
  constructor(
    string memory _name,
    string memory _symbol,
    uint8 _decimals,
    uint256 _performanceFeeBPS,
    uint256 _managementFeeBPS,
    address _rewards,
    address[] memory _accessControlPolicies
  ) AccessControlManager(_accessControlPolicies) ERC20(_name, _symbol) ERC20Permit(_name) {
    require(_rewards != address(0), "invalid rewards address");
    require(_performanceFeeBPS < MAX_BASIS_POINTS, "performance fee is over 100%");
    require(_managementFeeBPS < MAX_BASIS_POINTS, "management fee is over 100%");
    vaultDecimals = _decimals;
    activation = block.timestamp;
    address sender = _msgSender();
    _updateGovernance(sender);
    _updateManagement(sender);
    _updateGuardian(sender);
    _updateRewards(_rewards);
    _updatePerformanceFee(_performanceFeeBPS);
    _updateManagementFee(_managementFeeBPS);
  }

  ///@notice returns decimals value of the vault
  function decimals() public view override returns (uint8) {
    return vaultDecimals;
  }

  ///@notice set the wallet address to send the collected fees to. Only can be called by the governance.
  ///@param _rewards the new wallet address to send the fees to.
  function setRewards(address _rewards) external onlyGovernance {
    require(_rewards != address(0), "rewards address is not valid");
    require(_rewards != rewards, "already the rewards");
    _updateRewards(_rewards);
  }

  ///@notice set the performance fee in basis points. 1 basis point is 0.01% and 100% is 10000 basis points.
  function setPerformanceFee(uint256 _performanceFee) external onlyGovernance {
    require(_performanceFee < MAX_BASIS_POINTS, "performance fee is over 100%");
    _updatePerformanceFee(_performanceFee);
  }

  ///@notice set the management fee in basis points. 1 basis point is 0.01% and 100% is 10000 basis points.
  function setManagementFee(uint256 _managementFee) external onlyGovernance {
    require(_managementFee < MAX_BASIS_POINTS, "management fee is over 100%");
    _updateManagementFee(_managementFee);
  }

  ///@notice Changes the locked profit degradation.
  ///@param _degradation The rate of degradation in percent per second scaled to 1e18.
  function setLockedProfileDegradation(uint256 _degradation) external onlyGovernance {
    require(_degradation <= DEGRADATION_COEFFICIENT, "degradation value is too large");
    lockedProfitDegradation = _degradation;
  }

  /**
   * @notice Activates or deactivates Vault mode where all Strategies go into full
   * withdrawal.
   * During Emergency Shutdown:
   *   1. No Users may deposit into the Vault (but may withdraw as usual.)
   *   2. Governance may not add new Strategies.
   *   3. Each Strategy must pay back their debt as quickly as reasonable to minimally affect their position.
   *   4. Only Governance may undo Emergency Shutdown.
   *
   *   See contract level note for further details.
   *
   *   This may only be called by governance or the guardian.
   * @param _active If true, the Vault goes into Emergency Shutdown. If false, the Vault
   * goes back into Normal Operation.
   */
  function setEmergencyShutdown(bool _active) external {
    if (_active) {
      require(_msgSender() == guardian || _msgSender() == governance, "only guardian or governance");
    } else {
      require(_msgSender() == governance, "only governance");
    }
    emergencyShutdown = _active;
    emit EmergencyShutdown(_active);
  }

  function sweep(address _token, uint256 _amount) external onlyGovernance {
    require(_isVaultToken(_token) == false, "_token is vault token");
    IERC20 token = IERC20(_token);
    if (_amount == type(uint256).max) {
      _amount = token.balanceOf(address(this));
    }
    token.safeTransfer(governance, _amount);
  }

  function _updateRewards(address _rewards) internal {
    rewards = _rewards;
    emit RewardsUpdated(rewards);
  }

  function _updatePerformanceFee(uint256 _performanceFee) internal {
    performanceFee = _performanceFee;
    emit PerformanceFeeUpdated(performanceFee);
  }

  function _updateManagementFee(uint256 _managementFee) internal {
    managementFee = _managementFee;
    emit ManagementFeeUpdated(managementFee);
  }

  function _isVaultToken(address _token) internal pure virtual returns (bool);
}
