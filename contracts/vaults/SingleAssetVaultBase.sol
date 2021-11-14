// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./BaseVault.sol";

abstract contract SingleAssetVaultBase is BaseVault {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  /// @notice the timestamp of the last report received from a strategy
  uint256 internal lastReport;
  /// @notice how much profit is locked and cant be withdrawn
  uint256 public lockedProfit;
  /// @notice total value borrowed by all the strategies
  uint256 public totalDebt;
  address internal tokenAddress;
  IERC20 public token;

  constructor(
    string memory _name,
    string memory _symbol,
    address _governance,
    address _gatekeeper,
    address _rewards,
    address _strategyDataStoreAddress,
    address _token
  ) BaseVault(_name, _symbol, _governance, _gatekeeper, _rewards, _strategyDataStoreAddress) {
    require(_token != address(0), "invalid token address");
    tokenAddress = _token;
    token = IERC20(_token);
    // the vault decimals need to match the tokens to avoid any conversion
    vaultDecimals = ERC20(tokenAddress).decimals();
  }

  /// @notice Returns the total quantity of all assets under control of this
  ///   Vault, whether they're loaned out to a Strategy, or currently held in
  ///   the Vault.
  /// @return The total assets under control of this Vault.
  function totalAsset() external view returns (uint256) {
    return _totalAsset();
  }

  /// @notice the remaining amount of underlying tokens that still can be deposited into the vault before reaching the limit
  function availableDepositLimit() external view returns (uint256) {
    return _availableDepositLimit();
  }

  /// @notice Determines the maximum quantity of shares this Vault can facilitate a
  ///  withdrawal for, factoring in assets currently residing in the Vault,
  ///  as well as those deployed to strategies on the Vault's balance sheet.
  /// @dev Regarding how shares are calculated, see dev note on `deposit`.
  ///  If you want to calculated the maximum a user could withdraw up to,
  ///  you want to use this function.
  /// Note that the amount provided by this function is the theoretical
  ///  maximum possible from withdrawing, the real amount depends on the
  ///  realized losses incurred during withdrawal.
  /// @return The total quantity of shares this Vault can provide.
  function maxAvailableShares() external view returns (uint256) {
    return _maxAvailableShares();
  }

  /// @notice Gives the price for a single Vault share.
  /// @dev See dev note on `withdraw`.
  /// @return The value of a single share.
  function pricePerShare() external view returns (uint256) {
    return _shareValue(10**vaultDecimals);
  }

  /// @notice Determines if `_strategy` is past its debt limit and if any tokens
  ///  should be withdrawn to the Vault.
  /// @param _strategy The Strategy to check.
  /// @return The quantity of tokens to withdraw.
  function debtOutstanding(address _strategy) external view returns (uint256) {
    return _debtOutstanding(_strategy);
  }

  /// @notice Amount of tokens in Vault a Strategy has access to as a credit line.
  ///  This will check the Strategy's debt limit, as well as the tokens
  ///  available in the Vault, and determine the maximum amount of tokens
  ///  (if any) the Strategy may draw on.
  /// In the rare case the Vault is in emergency shutdown this will return 0.
  /// @param _strategy The Strategy to check.
  /// @return The quantity of tokens available for the Strategy to draw on.
  function creditAvailable(address _strategy) external view returns (uint256) {
    return _creditAvailable(_strategy);
  }

  /// @notice Provide an accurate expected value for the return this `strategy`
  /// would provide to the Vault the next time `report()` is called
  /// (since the last time it was called).
  /// @param _strategy The Strategy to determine the expected return for.
  /// @return The anticipated amount `strategy` should make on its investment since its last report.
  function expectedReturn(address _strategy) external view returns (uint256) {
    return _expectedReturn(_strategy);
  }

  /// @notice send the tokens that are not managed by the vault to the governance
  /// @param _token the token to send
  /// @param _amount the amount of tokens to send
  function sweep(address _token, uint256 _amount) external {
    _onlyGovernance();
    require(tokenAddress != _token, "invalid token");
    _sweep(_token, _amount, governance);
  }

  function _totalAsset() internal view returns (uint256) {
    return token.balanceOf(address(this)).add(totalDebt);
  }

  function _availableDepositLimit() internal view returns (uint256) {
    if (depositLimit > _totalAsset()) {
      return depositLimit.sub(_totalAsset());
    }
    return 0;
  }

  function _shareValue(uint256 _sharesAmount) internal view returns (uint256) {
    uint256 supply = totalSupply();
    // if the value is empty then the price is 1:1
    if (supply == 0) {
      return _sharesAmount;
    }
    return _sharesAmount.mul(_freeFunds()).div(supply);
  }

  function _calculateLockedProfit() internal view returns (uint256) {
    // solhint-disable-next-line not-rely-on-time
    uint256 lockedFundRatio = block.timestamp.sub(lastReport).mul(lockedProfitDegradation);
    if (lockedFundRatio < DEGRADATION_COEFFICIENT) {
      return lockedProfit.sub(lockedFundRatio.mul(lockedProfit).div(DEGRADATION_COEFFICIENT));
    } else {
      return 0;
    }
  }

  function _freeFunds() internal view returns (uint256) {
    return _totalAsset().sub(_calculateLockedProfit());
  }

  function _sharesForAmount(uint256 _amount) internal view returns (uint256) {
    uint256 freeFunds_ = _freeFunds();
    if (freeFunds_ > 0) {
      return _amount.mul(totalSupply()).div(freeFunds_);
    }
    return 0;
  }

  function _maxAvailableShares() internal view returns (uint256) {
    uint256 shares_ = _sharesForAmount(token.balanceOf(address(this)));
    address[] memory withdrawQueue = _strategyDataStore().withdrawQueue(address(this));
    for (uint256 i = 0; i < withdrawQueue.length; i++) {
      shares_ = shares_.add(_sharesForAmount(strategies[withdrawQueue[i]].totalDebt));
    }
    return shares_;
  }

  function _debtOutstanding(address _strategy) internal view returns (uint256) {
    _validateStrategy(_strategy);
    if (_strategyDataStore().vaultTotalDebtRatio(address(this)) == 0) {
      return strategies[_strategy].totalDebt;
    }
    uint256 availableAssets_ = _totalAsset();
    uint256 strategyLimit_ = availableAssets_.mul(_strategyDataStore().strategyDebtRatio(address(this), _strategy)).div(
      MAX_BASIS_POINTS
    );
    uint256 strategyTotalDebt_ = strategies[_strategy].totalDebt;

    if (emergencyShutdown) {
      return strategyTotalDebt_;
    } else if (strategyTotalDebt_ <= strategyLimit_) {
      return 0;
    } else {
      return strategyTotalDebt_.sub(strategyLimit_);
    }
  }

  function _creditAvailable(address _strategy) internal view returns (uint256) {
    if (emergencyShutdown) {
      return 0;
    }
    _validateStrategy(_strategy);
    uint256 vaultTotalAsset_ = _totalAsset();
    uint256 vaultTotalDebtLimit_ = vaultTotalAsset_.mul(_strategyDataStore().vaultTotalDebtRatio(address(this))).div(
      MAX_BASIS_POINTS
    );
    uint256 vaultTotalDebt_ = totalDebt;

    uint256 strategyDebtLimit_ = vaultTotalAsset_
      .mul(_strategyDataStore().strategyDebtRatio(address(this), _strategy))
      .div(MAX_BASIS_POINTS);
    uint256 strategyTotalDebt_ = strategies[_strategy].totalDebt;
    uint256 strategyMinDebtPerHarvest_ = _strategyDataStore().strategyMinDebtPerHarvest(address(this), _strategy);
    uint256 strategyMaxDebtPerHarvest_ = _strategyDataStore().strategyMaxDebtPerHarvest(address(this), _strategy);

    if ((strategyDebtLimit_ <= strategyTotalDebt_) || (vaultTotalDebtLimit_ <= vaultTotalDebt_)) {
      return 0;
    }

    uint256 available_ = strategyDebtLimit_.sub(strategyTotalDebt_);
    available_ = Math.min(available_, vaultTotalDebtLimit_.sub(vaultTotalDebt_));
    available_ = Math.min(available_, token.balanceOf(address(this)));

    if (available_ < strategyMinDebtPerHarvest_) {
      return 0;
    } else {
      return Math.min(available_, strategyMaxDebtPerHarvest_);
    }
  }

  function _expectedReturn(address _strategy) internal view returns (uint256) {
    _validateStrategy(_strategy);
    uint256 strategyLastReport_ = strategies[_strategy].lastReport;
    // solhint-disable-next-line not-rely-on-time
    uint256 sinceLastHarvest_ = block.timestamp.sub(strategyLastReport_);
    uint256 totalHarvestTime_ = strategyLastReport_.sub(strategies[_strategy].activation);

    // NOTE: If either `sinceLastHarvest_` or `totalHarvestTime_` is 0, we can short-circuit to `0`
    if ((sinceLastHarvest_ > 0) && (totalHarvestTime_ > 0) && (IStrategy(_strategy).isActive())) {
      // # NOTE: Unlikely to throw unless strategy accumalates >1e68 returns
      // # NOTE: Calculate average over period of time where harvests have occured in the past
      return strategies[_strategy].totalGain.mul(sinceLastHarvest_).div(totalHarvestTime_);
    } else {
      return 0;
    }
  }
}
