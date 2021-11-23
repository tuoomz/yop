// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-IERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../interfaces/IStrategy.sol";
import "../interfaces/IVaultStrategyDataStore.sol";
import "./VaultMetaDataStore.sol";

// the Vault itself also represents an ERC20 token, which means it also inherits all methods that are available on the ERC20 interface.
// This token is the shares that the users will get when they deposit money into the Vault
interface IBaseVault is IERC20Upgradeable, IERC20PermitUpgradeable {
  function addStrategy(address _strategy) external returns (bool);

  function migrateStrategy(address _oldVersion, address _newVersion) external returns (bool);

  function revokeStrategy() external;
}

/// @dev This contract is marked abstract to avoid being used directly.
///  NOTE: do not add any new state variables to this contract. If needed, see {VaultDataStorage.sol} instead.
abstract contract BaseVault is IBaseVault, ERC20PermitUpgradeable, VaultMetaDataStore {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  event StrategyAdded(address indexed _strategy);
  event StrategyMigrated(address indexed _oldVersion, address indexed _newVersion);
  event StrategyRevoked(address indexed _strategy);

  // solhint-disable-next-line no-empty-blocks
  constructor() {}

  // solhint-disable-next-line
  function __BaseVault__init_unchained() internal {}

  // solhint-disable-next-line func-name-mixedcase
  function __BaseVault__init(
    string memory _name,
    string memory _symbol,
    address _governance,
    address _gatekeeper,
    address _rewards,
    address _strategyDataStoreAddress,
    address _accessManager
  ) internal {
    __ERC20_init(_name, _symbol);
    __ERC20Permit_init(_name);
    __VaultMetaDataStore_init(_governance, _gatekeeper, _rewards, _strategyDataStoreAddress, _accessManager);
    __BaseVault__init_unchained();
  }

  /// @notice returns decimals value of the vault
  function decimals() public view override returns (uint8) {
    return vaultDecimals;
  }

  /// @notice Init a new strategy. This should only be called by the {VaultStrategyDataStore} and should not be invoked manually.
  ///   Use {VaultStrategyDataStore.addStrategy} to manually add a strategy to a Vault.
  /// @dev This will be called by the {VaultStrategyDataStore} when a strategy is added to a given Vault.
  function addStrategy(address _strategy) external returns (bool) {
    _onlyNotEmergencyShutdown();
    _onlyStrategyDataStore();
    return _addStrategy(_strategy);
  }

  /// @notice Migrate a new strategy. This should only be called by the {VaultStrategyDataStore} and should not be invoked manually.
  ///   Use {VaultStrategyDataStore.migrateStrategy} to manually migrate a strategy for a Vault.
  /// @dev This will called be the {VaultStrategyDataStore} when a strategy is migrated.
  ///  This will then call the strategy to migrate (as the strategy only allows the vault to call the migrate function).
  function migrateStrategy(address _oldVersion, address _newVersion) external returns (bool) {
    _onlyStrategyDataStore();
    return _migrateStrategy(_oldVersion, _newVersion);
  }

  /// @notice called by the strategy to revoke itself. Should not be called by any other means.
  ///  Use {VaultStrategyDataStore.revokeStrategy} to revoke a strategy manaully.
  /// @dev The strategy could talk to the {VaultStrategyDataStore} directly when revoking itself.
  ///  However, that means we will need to change the interfaces to Strategies and make them incompatible with Yearn's strategies.
  ///  To avoid that, the strategies will continue talking to the Vault and the Vault will then let the {VaultStrategyDataStore} know.
  function revokeStrategy() external {
    require(strategies[_msgSender()].activation > 0, "not authorised");
    _strategyDataStore().revokeStrategyByStrategy(_msgSender());
    emit StrategyRevoked(_msgSender());
  }

  function strategy(address _strategy) external view returns (StrategyInfo memory) {
    return strategies[_strategy];
  }

  function strategyDebtRatio(address _strategy) external view returns (uint256) {
    return _strategyDataStore().strategyDebtRatio(address(this), _strategy);
  }

  function _strategyDataStore() internal view returns (IVaultStrategyDataStore) {
    return IVaultStrategyDataStore(strategyDataStore);
  }

  function _onlyStrategyDataStore() internal view {
    require(_msgSender() == strategyDataStore, "only strategy store");
  }

  /// @dev ensure the vault is not in emergency shutdown mode
  function _onlyNotEmergencyShutdown() internal view {
    require(emergencyShutdown == false, "emergency shutdown");
  }

  function _validateStrategy(address _strategy) internal view {
    require(strategies[_strategy].activation > 0, "invalid strategy");
  }

  function _addStrategy(address _strategy) internal returns (bool) {
    /* solhint-disable not-rely-on-time */
    strategies[_strategy] = StrategyInfo({
      activation: block.timestamp,
      lastReport: block.timestamp,
      totalDebt: 0,
      totalGain: 0,
      totalLoss: 0
    });
    emit StrategyAdded(_strategy);
    return true;
    /* solhint-enable */
  }

  function _migrateStrategy(address _oldVersion, address _newVersion) internal returns (bool) {
    StrategyInfo memory info = strategies[_oldVersion];
    strategies[_oldVersion].totalDebt = 0;
    strategies[_newVersion] = StrategyInfo({
      activation: info.activation,
      lastReport: info.lastReport,
      totalDebt: info.lastReport,
      totalGain: 0,
      totalLoss: 0
    });
    IStrategy(_oldVersion).migrate(_newVersion);
    emit StrategyMigrated(_oldVersion, _newVersion);
    return true;
  }

  function _sweep(
    address _token,
    uint256 _amount,
    address _to
  ) internal {
    IERC20Upgradeable token_ = IERC20Upgradeable(_token);
    if (_amount == type(uint256).max) {
      _amount = token_.balanceOf(address(this));
    }
    token_.safeTransfer(_to, _amount);
  }
}
