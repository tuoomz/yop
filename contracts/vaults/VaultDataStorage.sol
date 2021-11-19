// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/// @dev this contract is used to declare all the state variables that will be used by a Vault.
///  Because the vault itself is upgradeable, changes to state variables could cause data corruption.
///  The only safe operation is to add new fields, or rename an existing one (still not recommended to rename a field).
///  To avoid any issues, if a new field is needed, we should create a new version of the data store and extend the previous version,
///  rather than modifying the state variables directly.
// solhint-disable-next-line max-states-count
contract VaultDataStorage {
  using SafeMath for uint256;

  struct StrategyInfo {
    uint256 activation;
    uint256 lastReport;
    uint256 totalDebt;
    uint256 totalGain;
    uint256 totalLoss;
  }
  // ### Vault base properties
  uint8 internal vaultDecimals;
  bool public emergencyShutdown;
  /// @notice timestamp for when the vault is deployed
  uint256 public activation;
  uint256 public managementFee;
  /// @notice degradation for locked profit per second
  /// @dev the value is based on 6-hour degradation period (1/(60*60*6) = 0.000046)
  ///   NOTE: This is being deprecated by Yearn. See https://github.com/yearn/yearn-vaults/pull/471
  uint256 public lockedProfitDegradation;
  uint256 public depositLimit;
  /// @notice the timestamp of the last report received from a strategy
  uint256 internal lastReport;
  /// @notice how much profit is locked and cant be withdrawn
  uint256 public lockedProfit;
  /// @notice total value borrowed by all the strategies
  uint256 public totalDebt;

  address public rewards;
  address public healthCheck;
  address public strategyDataStore;
  address public accessManager;
  address internal tokenAddress;

  IERC20Upgradeable public token;
  mapping(address => StrategyInfo) internal strategies;

  uint256 internal constant DEGRADATION_COEFFICIENT = 10**18;

  /// @dev set the default values for the state variables here
  // solhint-disable-next-line func-name-mixedcase
  function __VaultDataStorage_init() internal {
    vaultDecimals = 18;
    lockedProfitDegradation = DEGRADATION_COEFFICIENT.mul(46).div(10**6);
    depositLimit = type(uint256).max;
    /* solhint-disable  not-rely-on-time */
    activation = block.timestamp;
    lastReport = block.timestamp;
    /* solhint-enable */
  }
}
