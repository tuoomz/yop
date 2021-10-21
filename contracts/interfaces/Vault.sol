// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// this interface will allow us to implement different types of access policies for Vaults.
// e.g. whitelist/blacklist based, NFT based etc. Then a vault can reuse these to control access to them.
interface IVaultAccessPolicy {
  /// @notice control if a user can access the given vault
  function canAccess(address vault, address user) external returns (bool);
}

// the Vault itself also represents an ERC20 token, which means it also inherits all methods that are available on the ERC20 interface.
// This token is the shares that the users will get when they deposit money into the Vault
interface IVault is IERC20 {
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
  event GovenanceUpdated(address _govenance);
  event GovenanceProposed(address _pendingGovenance);
  event ManagementUpdated(address _management);
  event RewardsUpdated(address _rewards);
  event DepositLimitUpdated(uint256 _limit);
  event PerformanceFeeUpdated(uint256 _performance);
  event ManagementFeeUpdated(uint256 _managementFee);
  event GuardianUpdated(uint256 _guardian);
  event EmergencyShutdownActivated();
  event EmergencyShutdownDeactivated();
  event WithdrawQueueUpdated(address[] _queue);
  event StrategyDebtRatioUpdated(address indexed _strategy, uint256 _debtRatio);
  event StrategyMinDebtPerHarvestUpdated(address indexed _strategy, uint256 _minDebtPerHarvest);
  event StrategyMaxDebtPerHarvestUpdated(address indexed _strategy, uint256 _maxDebtPerHarvest);
  event StrategyPerformanceFeeUpdated(address indexed _strategy, uint256 _performanceFee);
  event StrategyMigrated(address indexed _old, address indexed, address _new);
  event StrategyRevoked(address indexed _strategy);
  event StrategyRemovedFromQueue(address indexed _strategy);
  event StrategyAddedToQueue(address indexed _strategy);

  // *** The following are read functions and can be called by anyone *** //
  // some basic information about the vault
  function name() external view returns (string memory);

  function symbol() external view returns (string memory);

  function decimal() external view returns (uint256);

  function token() external view returns (address);

  // admins for the Vault. We could switch to a role-based system.
  function governance() external view returns (address);

  function management() external view returns (address);

  function guardian() external view returns (address);

  function rewards() external view returns (address);

  function managementFee() external view returns (uint256);

  function performanceFee() external view returns (uint256);

  function totalAsset() external view returns (uint256);

  function maxAvailableShares() external view returns (uint256);

  /// @notice the price of the Vault token against the underlying token
  function pricePerShare() external view returns (uint256);

  /// @notice total outstanding debt across all strategies
  function totalDebtOutstanding() external view returns (uint256);

  /// @notice outstanding debt for a given strategy. Outstanding debt is the over limit debt that a strategy has borrowed
  function debtOutstanding(address strategy) external view returns (uint256);

  /// @notice total credits available across all strategies
  function totalCreditAvailable() external view returns (uint256);

  /// @notice the amount of credits available to a strategy. Its value equals to (canBeBorrowed - actualBorrowed)
  function creditAvailable(address strategy) external view;

  /// @notice the maximum amount of underlying tokens that can be deposited into the vault
  function depositLimit() external view returns (uint256);

  /// @notice the remaining amount of underlying tokens that still can be deposited into the vault before reaching the limit
  function availableDepositLimit() external view returns (uint256);

  /// @notice total amount of expected returns across all strategies
  function totalExpectedReturn() external view returns (uint256);

  /// @notice expected returns for the given strategy
  function expectedReturn(address strategy) external view returns (uint256);

  /// @notice get the details for a given strategy
  function strategies(address strategy) external view returns (StrategyParams memory);

  /// @notice return the position of the given strategy in the withdrawQueue
  function withdrawQueue(address strategy) external view returns (uint256);

  /// @notice if the vault is in emergencyShutdown mode
  function emergencyShutdown() external view returns (bool);

  /// @notice sum of all strategies' debt ratio settings
  function debtRatio() external view returns (uint256);

  /// @notice all the underlying tokens borrowed by all the strategies
  function totalDebt() external view returns (uint256);

  /// @notice the timestamp of the last time a strategy reported back
  function lastReport() external view returns (uint256);

  /// @notice when the vault was created
  function activation() external view returns (uint256);

  /// @notice access policies set on the vault
  function accessPolicies() external view returns (address[] memory);

  // *** The following are write functions and can be called by anyone *** //
  /// @notice deposit the given amount into the vault, and return the number of shares
  function deposit(uint256 _amount) external returns (uint256);

  /// @notice burn the given amount of shares from the vault, and return the number of underlying tokens recovered
  function withdraw(
    uint256 _shares,
    address _recipient,
    uint256 _maxLoss
  ) external returns (uint256);

  // *** The following are write functions that can only be called by the govenance *** //
  function setSymbol(string calldata _symbol) external;

  function setName(string calldata _name) external;

  function setGovenance(address _govenor) external;

  function setManagement(address _management) external;

  function setRewards(address _rewards) external;

  function setPerformanceFee(uint256 _performanceFee) external;

  function setManagementFee(uint256 _managementFee) external;

  function setLockedProfileDegradation(uint256 _degradation) external;

  function setDepositLimit(uint256 _depositLimit) external;

  function addStrategy(
    address _strategy,
    uint256 _debtRation,
    uint256 _minDebtPerHarvest,
    uint256 _maxDebtPerHarvest,
    uint256 _performanceFee,
    uint256 _profitLimitRatio,
    uint256 _lossLimitRatio
  ) external;

  function updateStrategyPerformance(address _strategy, uint256 _performanceFee) external;

  function migrateStrategy(address _oldStrategy, address _newStrategy) external;

  /// @notice remove tokens that are not managed by the Vault to the govenance account
  function sweep(address _token, uint256 _amount) external;

  function addAccessPolicy(address _accessPolicy) external;

  function removeAccessPolicy(address _accessPolicy) external;

  function acceptGovenance() external; // this can be only called by the pending govenance

  // *** The following are write functions that can only be called by the govenance or the management *** //
  function setWithdrawQueue(address[] calldata _queue) external;

  function updateStrategyDebtRatio(address _strategy, uint256 _debtRation) external;

  function updateStrategyMinDebtHarvest(address _strategy, uint256 _minDebtPerHarvest) external;

  function updateStrategyMaxDebtHarvest(address _strategy, uint256 _maxDebtPerHarvest) external;

  function addStrategyToWithdrawQueue(address _strategy) external;

  function removeStrategyFromWithdrawQueue(address _strategy) external;

  // *** The following are write functions that can only be called by the govenance or the guardian *** //
  function setGuardian(address _guardian) external;

  function setEmergencyShutdown(bool _active) external;

  function revokeStrategy(address strategy) external; // this can also be called by the strategy itself

  // *** The following are write functions that can only be called by the strategies *** //
  function report(
    uint256 _gain,
    uint256 _loss,
    uint256 _debtPayment
  ) external returns (uint256);
}

// abstract contract VaultBase {
//   /// @dev the address of the current govenor
//   address public govenor;
//   /// @dev the address of the pending govenor
//   address public pendingGovenor;
//   /// @dev the address of the management for the vault
//   address public management;
//   /// @dev the address of the guardian for the vault
//   address public guardian;

//   /// ### Management related
//   uint256 public managementFee;
//   /// @dev fees collected from the strategies
//   uint256 public performanceFee;
//   /// @dev rewards contract to send the fees collected
//   address public rewards;

//   // ### Vault base properties
//   /// @dev the name of the vault
//   string public name;
//   /// @dev the symbol of the vault
//   string public symbol;
//   /// @dev the underlying token for the Vault
//   address public tokenAddress;

//   // ### Strategies related
//   /// @dev maximum number of strategies allowed for the withdraw queue
//   uint256 constant MAX_STRATEGIES = 20;

//   /// @dev the addresses of strategies for the Vault
//   mapping(address => StrategyParams) public strategies;

//   /// @dev the ordering that `withdraw` uses to determine wich strategies to pull funds from
//   ///      should be determined by the ?
//   address[MAX_STRATEGIES] public withdrawQueue;

//   // ### Assets related
//   uint256 public depositLimit;
//   uint256 public totalAsset;
// }
