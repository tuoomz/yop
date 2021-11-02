// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../interfaces/IHealthCheck.sol";
import "./BaseVault.sol";

interface ISingleAssetVault is IBaseVault {
  function totalAsset() external view returns (uint256);

  function maxAvailableShares() external view returns (uint256);

  /// @notice the price of the Vault token against the underlying token
  function pricePerShare() external view returns (uint256);

  /// @notice outstanding debt for a given strategy. Outstanding debt is the over limit debt that a strategy has borrowed
  function debtOutstanding(address strategy) external view returns (uint256);

  /// @notice the amount of credits available to a strategy. Its value equals to (canBeBorrowed - actualBorrowed)
  function creditAvailable(address strategy) external view returns (uint256);

  /// @notice the maximum amount of underlying tokens that can be deposited into the vault
  function depositLimit() external view returns (uint256);

  /// @notice the remaining amount of underlying tokens that still can be deposited into the vault before reaching the limit
  function availableDepositLimit() external view returns (uint256);

  /// @notice expected returns for the given strategy
  function expectedReturn(address strategy) external view returns (uint256);

  /// @notice all the underlying tokens borrowed by all the strategies
  function totalDebt() external view returns (uint256);

  /// @notice the timestamp of the last time a strategy reported back
  function lastReport() external view returns (uint256);

  function tokenAddress() external view returns (address);

  function setDepositLimit(uint256 _depositLimit) external;

  function setMaxTotalDebtRatio(uint256 _maxDebtRatio) external;

  function sweep(address _token, uint256 _amount) external;

  /// @notice deposit the given amount into the vault, and return the number of shares
  function deposit(uint256 _amount) external returns (uint256);

  /// @notice burn the given amount of shares from the vault, and return the number of underlying tokens recovered
  function withdraw(
    uint256 _shares,
    address _recipient,
    uint256 _maxLoss
  ) external returns (uint256);

  function report(
    uint256 _gain,
    uint256 _loss,
    uint256 _debtPayment
  ) external returns (uint256);
}

contract SingleAssetVault is ISingleAssetVault, BaseVault, Pausable, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;
  using Math for *;

  event DepositLimitUpdated(uint256 _limit);

  /// @notice total value borrowed by all the strategies
  uint256 public totalDebt;

  /// @notice the timestamp of the last report received from a strategy
  uint256 public lastReport;

  /// @notice the limit of the total asset this vault can hold
  uint256 public depositLimit = type(uint256).max;

  /// @notice how much profit is locked and cant be withdrawn
  uint256 public lockedProfit;

  uint256 public constant SECONDS_PER_YEAR = 31_556_952; // 365.2425 days
  address public tokenAddress;

  IERC20 private token;

  /// @dev construct a vault using a single asset.
  /// @param _name the name of the vault
  /// @param _symbol the symbol of the vault
  /// @param _decimals vault decimals
  /// @param _managementFeeBPS basis points for the management fee. 1 basis point is 0.01% and 100% is 10000 basis points.
  /// @param _rewards the address to send the collected fees to
  /// @param _manager the address of the manager of the vault
  /// @param _gatekeeper the address of the gatekeeper of the valut
  /// @param _token the address of the token asset
  constructor(
    string memory _name,
    string memory _symbol,
    uint8 _decimals,
    uint256 _managementFeeBPS,
    address _rewards,
    address _manager,
    address _gatekeeper,
    address _token
  ) BaseVault(_name, _symbol, _decimals, _managementFeeBPS, _rewards, _manager, _gatekeeper) {
    require(_token != address(0), "invalid token address");
    tokenAddress = _token;
    token = IERC20(_token);
    lastReport = block.timestamp;
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
    uint256 shares_ = _sharesForAmount(token.balanceOf(address(this)));
    for (uint256 i = 0; i < withdrawQueue.length; i++) {
      shares_ = shares_.add(_sharesForAmount(strategies[withdrawQueue[i]].totalDebt));
    }
    return shares_;
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

  /// @notice see `debtOutstanding(address _strategy)`. Use `msg.sender` as the strategy.
  function debtOutstanding() external view returns (uint256) {
    return _debtOutstanding(_msgSender());
  }

  /// @notice Amount of tokens in Vault a Strategy has access to as a credit line.
  ///  This will check the Strategy's debt limit, as well as the tokens
  ///  available in the Vault, and determine the maximum amount of tokens
  ///  (if any) the Strategy may draw on.
  /// In the rare case the Vault is in emergency shutdown this will return 0.
  /// @param _strategy The Strategy to check.
  /// @return The quantity of tokens available for the Strategy to draw on.
  function creditAvailable(address _strategy) external view returns (uint256) {
    require(strategies[_strategy].activation > 0, "invalid strategy");
    return _creditAvailable(_strategy);
  }

  /// @notice see `creditAvailable(address _strategy)`. Use `msg.sender` as the strategy.
  function creditAvailable() external view returns (uint256) {
    return _creditAvailable(_msgSender());
  }

  /// @notice Provide an accurate expected value for the return this `strategy`
  /// would provide to the Vault the next time `report()` is called
  /// (since the last time it was called).
  /// @param _strategy The Strategy to determine the expected return for.
  /// @return The anticipated amount `strategy` should make on its investment since its last report.
  function expectedReturn(address _strategy) external view returns (uint256) {
    return _expectedReturn(_strategy);
  }

  /// @notice sets the deposit limit of the vault
  function setDepositLimit(uint256 _limit) external {
    _onlyGovernanceOrGatekeeper();
    depositLimit = _limit;
    emit DepositLimitUpdated(_limit);
  }

  /// @notice set the maximum total debt ratio of all the strategies combined. In basis points.
  function setMaxTotalDebtRatio(uint256 _maxDebtRatio) external {
    _onlyGovernanceOrManager();
    _setMaxTotalDebtRatio(_maxDebtRatio);
  }

  /// @notice Deposits `_amount` `token`, issuing shares to `recipient`. If the
  ///  Vault is in Emergency Shutdown, deposits will not be accepted and this
  ///  call will fail.
  /// @dev Measuring quantity of shares to issues is based on the total
  ///  outstanding debt that this contract has ("expected value") instead
  ///  of the total balance sheet it has ("estimated value") has important
  ///  security considerations, and is done intentionally. If this value were
  ///  measured against external systems, it could be purposely manipulated by
  ///  an attacker to withdraw more assets than they otherwise should be able
  ///  to claim by redeeming their shares.
  ///  On deposit, this means that shares are issued against the total amount
  ///  that the deposited capital can be given in service of the debt that
  ///  Strategies assume. If that number were to be lower than the "expected
  ///  value" at some future point, depositing shares via this method could
  ///  entitle the depositor to *less* than the deposited value once the
  ///  "realized value" is updated from further reports by the Strategies
  ///  to the Vaults.
  ///  Care should be taken by integrators to account for this discrepancy,
  ///  by using the view-only methods of this contract (both off-chain and
  ///  on-chain) to determine if depositing into the Vault is a "good idea".
  /// @param _amount The quantity of tokens to deposit, defaults to all.
  ///  caller's address.
  /// @return The issued Vault shares.
  function deposit(uint256 _amount) external onlyNotEmergencyShutdown whenNotPaused nonReentrant returns (uint256) {
    return _deposit(_amount, _msgSender());
  }

  /// @notice same as `deposit(uint256 _amount)`, but allow specifying the receipient of the vault shares.
  /// @param _amount The quantity of tokens to deposit, defaults to all.
  /// @param _recipient The address to issue the shares in this Vault to. Defaults to the
  function deposit(uint256 _amount, address _recipient)
    external
    onlyNotEmergencyShutdown
    whenNotPaused
    nonReentrant
    returns (uint256)
  {
    return _deposit(_amount, _recipient);
  }

  /// @notice Withdraws the calling account's tokens from this Vault, redeeming
  ///  amount `_shares` for an appropriate amount of tokens.
  ///  See note on `setWithdrawalQueue` for further details of withdrawal
  ///  ordering and behavior.
  /// @dev Measuring the value of shares is based on the total outstanding debt
  ///  that this contract has ("expected value") instead of the total balance
  ///  sheet it has ("estimated value") has important security considerations,
  ///  and is done intentionally. If this value were measured against external
  ///  systems, it could be purposely manipulated by an attacker to withdraw
  ///  more assets than they otherwise should be able to claim by redeeming
  ///  their shares.

  ///  On withdrawal, this means that shares are redeemed against the total
  ///  amount that the deposited capital had "realized" since the point it
  ///  was deposited, up until the point it was withdrawn. If that number
  ///  were to be higher than the "expected value" at some future point,
  ///  withdrawing shares via this method could entitle the depositor to
  ///  *more* than the expected value once the "realized value" is updated
  ///  from further reports by the Strategies to the Vaults.

  ///  Under exceptional scenarios, this could cause earlier withdrawals to
  ///  earn "more" of the underlying assets than Users might otherwise be
  ///  entitled to, if the Vault's estimated value were otherwise measured
  ///  through external means, accounting for whatever exceptional scenarios
  ///  exist for the Vault (that aren't covered by the Vault's own design.)
  ///  In the situation where a large withdrawal happens, it can empty the
  ///  vault balance and the strategies in the withdrawal queue.
  ///  Strategies not in the withdrawal queue will have to be harvested to
  ///  rebalance the funds and make the funds available again to withdraw.
  /// @param _maxShares How many shares to try and redeem for tokens, defaults to all.
  /// @param _maxLoss The maximum acceptable loss to sustain on withdrawal in basis points.
  /// @return The quantity of tokens redeemed for `_shares`.
  function withdraw(uint256 _maxShares, uint256 _maxLoss)
    external
    onlyNotEmergencyShutdown
    whenNotPaused
    nonReentrant
    returns (uint256)
  {
    return _withdraw(_maxShares, _msgSender(), _maxLoss);
  }

  /// @notice see `withdraw(uint256 _maxShares, uint256 _maxLoss)`.
  /// @param _maxShares How many shares to try and redeem for tokens, defaults to all.
  /// @param _recipient The address to issue the shares in this Vault to.
  /// @param _maxLoss The maximum acceptable loss to sustain on withdrawal in basis points.
  /// @return The quantity of tokens redeemed for `_shares`.
  function withdraw(
    uint256 _maxShares,
    address _recipient,
    uint256 _maxLoss
  ) external onlyNotEmergencyShutdown whenNotPaused nonReentrant returns (uint256) {
    return _withdraw(_maxShares, _recipient, _maxLoss);
  }

  /// @notice Reports the amount of assets the calling Strategy has free (usually in terms of ROI).
  ///  The performance fee is determined here, off of the strategy's profits
  ///  (if any), and sent to governance.
  ///  The strategist's fee is also determined here (off of profits), to be
  ///  handled according to the strategist on the next harvest.
  ///  This may only be called by a Strategy managed by this Vault.
  /// @dev For approved strategies, this is the most efficient behavior.
  ///  The Strategy reports back what it has free, then Vault "decides"
  ///  whether to take some back or give it more. Note that the most it can
  ///  take is `gain + _debtPayment`, and the most it can give is all of the
  ///  remaining reserves. Anything outside of those bounds is abnormal behavior.
  ///  All approved strategies must have increased diligence around
  ///  calling this function, as abnormal behavior could become catastrophic.
  /// @param _gain Amount Strategy has realized as a gain on it's investment since its last report, and is free to be given back to Vault as earnings
  /// @param _loss Amount Strategy has realized as a loss on it's investment since its last report, and should be accounted for on the Vault's balance sheet.
  ///  The loss will reduce the debtRatio. The next time the strategy will harvest, it will pay back the debt in an attempt to adjust to the new debt limit.
  /// @param _debtPayment Amount Strategy has made available to cover outstanding debt
  /// @return Amount of debt outstanding (if totalDebt > debtLimit or emergency shutdown).
  function report(
    uint256 _gain,
    uint256 _loss,
    uint256 _debtPayment
  ) external returns (uint256) {
    address callerStrategy = _msgSender();
    _validateStrategy(callerStrategy);
    require(token.balanceOf(callerStrategy) >= _gain.add(_debtPayment), "not enough balance");

    if (healthCheck != address(0)) {
      IHealthCheck check = IHealthCheck(healthCheck);
      if (check.doHealthCheck(callerStrategy)) {
        require(
          check.check(
            callerStrategy,
            _gain,
            _loss,
            _debtPayment,
            _debtOutstanding(callerStrategy),
            strategies[callerStrategy].totalDebt
          ),
          "strategy is not healthy"
        );
      } else {
        check.enableCheck(callerStrategy);
      }
    }

    if (_loss > 0) {
      _reportLoss(callerStrategy, _loss);
    }
    // Assess both management fee and performance fee, and issue both as shares of the vault
    uint256 totalFees = _assessFees(callerStrategy, _gain);
    // Returns are always "realized gains"
    strategies[callerStrategy].totalGain = strategies[callerStrategy].totalGain.add(_gain);

    // Compute the line of credit the Vault is able to offer the Strategy (if any)
    uint256 credit = _creditAvailable(callerStrategy);

    // Outstanding debt the Strategy wants to take back from the Vault (if any)
    // NOTE: debtOutstanding <= StrategyParams.totalDebt
    uint256 debt = _debtOutstanding(callerStrategy);
    uint256 debtPayment = debt;
    if (_debtPayment < debtPayment) {
      debtPayment = _debtPayment;
    }

    if (debtPayment > 0) {
      _decreaseDebt(callerStrategy, debtPayment);
      debt = debt.sub(debtPayment);
    }

    // Update the actual debt based on the full credit we are extending to the Strategy
    // or the returns if we are taking funds back
    // NOTE: credit + self.strategies[msg.sender].totalDebt is always < self.debtLimit
    // NOTE: At least one of `credit` or `debt` is always 0 (both can be 0)
    if (credit > 0) {
      _increaseDebt(callerStrategy, credit);
    }

    // Give/take balance to Strategy, based on the difference between the reported gains
    // (if any), the debt payment (if any), the credit increase we are offering (if any),
    // and the debt needed to be paid off (if any)
    // NOTE: This is just used to adjust the balance of tokens between the Strategy and
    //       the Vault based on the Strategy's debt limit (as well as the Vault's).
    uint256 totalAvailable = _gain + debtPayment;
    if (totalAvailable < credit) {
      // credit surplus, give to Strategy
      token.safeTransfer(callerStrategy, credit.sub(totalAvailable));
    } else if (totalAvailable > credit) {
      // credit deficit, take from Strategy
      token.safeTransferFrom(callerStrategy, address(this), totalAvailable.sub(credit));
    }
    // else, don't do anything because it is balanced

    // Profit is locked and gradually released per block
    // NOTE: compute current locked profit and replace with sum of current and new
    uint256 locakedProfileBeforeLoss = _calculateLockedProfit() + _gain - totalFees;
    if (locakedProfileBeforeLoss > _loss) {
      lockedProfit = locakedProfileBeforeLoss.sub(_loss);
    } else {
      lockedProfit = 0;
    }

    strategies[callerStrategy].lastReport = block.timestamp;
    lastReport = block.timestamp;

    StrategyParams memory params = strategies[callerStrategy];
    emit StrategyReported(
      callerStrategy,
      _gain,
      _loss,
      debtPayment,
      params.totalGain,
      params.totalLoss,
      params.totalDebt,
      credit,
      params.debtRatio
    );

    if (strategies[callerStrategy].debtRatio == 0 || emergencyShutdown) {
      // Take every last penny the Strategy has (Emergency Exit/revokeStrategy)
      // NOTE: This is different than `debt` in order to extract *all* of the returns
      return IStrategy(callerStrategy).estimatedTotalAssets();
    } else {
      // Otherwise, just return what we have as debt outstanding
      return debt;
    }
  }

  /// @notice send the tokens that are not managed by the vault to the governance
  /// @param _token the token to send
  /// @param _amount the amount of tokens to send
  function sweep(address _token, uint256 _amount) external {
    _onlyGoverance();
    require(tokenAddress != _token, "invalid token");
    _sweep(_token, _amount);
  }

  function _increaseDebt(address _strategy, uint256 _amount) internal {
    strategies[_strategy].totalDebt = strategies[_strategy].totalDebt.add(_amount);
    totalDebt = totalDebt.add(_amount);
  }

  function _decreaseDebt(address _strategy, uint256 _amount) internal {
    strategies[_strategy].totalDebt = strategies[_strategy].totalDebt.sub(_amount);
    totalDebt = totalDebt.sub(_amount);
  }

  function _deposit(uint256 _amount, address _recipient) internal returns (uint256) {
    require(_recipient != address(0), "invalid receipient");
    require(_canAccessVault() == true, "no access");
    //TODO: do we also want to cap the `_amount` too?
    uint256 amount = _ensureValidDepositAmount(_amount);
    uint256 shares = _issueSharesForAmount(_recipient, amount);
    token.safeTransferFrom(_msgSender(), address(this), amount);
    return shares;
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

  function _ensureValidDepositAmount(uint256 _amount) internal view returns (uint256) {
    uint256 amount = _amount;
    uint256 balance = token.balanceOf(_msgSender());
    if (amount > balance) {
      amount = balance;
    }
    uint256 availableLimit = _availableDepositLimit();
    if (amount > availableLimit) {
      amount = availableLimit;
    }
    require(amount > 0, "invalid amount");
    return amount;
  }

  // TODO: implement this!
  function _canAccessVault() internal pure returns (bool) {
    return true;
  }

  function _issueSharesForAmount(address _recipient, uint256 _amount) internal returns (uint256) {
    uint256 shares = 0;
    uint256 supply = totalSupply();
    if (supply > 0) {
      // Mint amount of shares based on what the Vault is managing overall
      shares = _amount.mul(supply).div(_freeFunds());
    } else {
      // no existing shares, mint 1:1
      shares = _amount;
    }

    require(shares > 0, "invalid share amount");
    _mint(_recipient, _amount);
    return shares;
  }

  function _freeFunds() internal view returns (uint256) {
    return _totalAsset().sub(_calculateLockedProfit());
  }

  function _calculateLockedProfit() internal view returns (uint256) {
    uint256 lockedFundRatio = block.timestamp.sub(lastReport).mul(lockedProfitDegradation);
    if (lockedFundRatio < DEGRADATION_COEFFICIENT) {
      return lockedProfit.sub(lockedFundRatio.mul(lockedProfit).div(DEGRADATION_COEFFICIENT));
    } else {
      return 0;
    }
  }

  function _withdraw(
    uint256 _maxShares,
    address _recipient,
    uint256 _maxLoss
  ) internal returns (uint256) {
    require(_maxLoss <= MAX_BASIS_POINTS, "invalid maxLoss");
    uint256 shares = _ensureValidShares(_maxShares);
    uint256 value = _shareValue(shares);
    uint256 vaultBalance = token.balanceOf(address(this));
    uint256 totalLoss = 0;
    if (value > vaultBalance) {
      // We need to go get some from our strategies in the withdrawal queue
      // NOTE: This performs forced withdrawals from each Strategy. During
      // forced withdrawal, a Strategy may realize a loss. That loss
      // is reported back to the Vault, and the will affect the amount
      // of tokens that the withdrawer receives for their shares. They
      // can optionally specify the maximum acceptable loss (in BPS)
      // to prevent excessive losses on their withdrawals (which may
      // happen in certain edge cases where Strategies realize a loss)
      totalLoss = _withdrawFromStrategies(value);
    }
    vaultBalance = token.balanceOf(address(this));
    // NOTE: We have withdrawn everything possible out of the withdrawal queue,
    // but we still don't have enough to fully pay them back, so adjust
    // to the total amount we've freed up through forced withdrawals
    if (value > vaultBalance) {
      value = vaultBalance;
      // NOTE: Burn # of shares that corresponds to what Vault has on-hand,
      // including the losses that were incurred above during withdrawals
      shares = _sharesForAmount(value + totalLoss);
    }
    // NOTE: This loss protection is put in place to revert if losses from
    // withdrawing are more than what is considered acceptable.
    require(totalLoss <= _maxLoss.mul(value.add(totalLoss)).div(MAX_BASIS_POINTS), "loss is over limit");
    // burn shares
    _burn(_msgSender(), shares);

    // Withdraw remaining balance to _recipient (may be different to msg.sender) (minus fee)
    token.safeTransfer(_recipient, value);
    return value;
  }

  function _ensureValidShares(uint256 _shares) internal view returns (uint256) {
    uint256 shares = _shares;
    uint256 balance = balanceOf(_msgSender());
    if (shares > balance) {
      shares = balance;
    }
    require(shares > 0, "no shares");
    return shares;
  }

  function _shareValue(uint256 _sharesAmount) internal view returns (uint256) {
    uint256 supply = totalSupply();
    // if the value is empty then the price is 1:1
    if (supply == 0) {
      return _sharesAmount;
    }
    return _sharesAmount.mul(_freeFunds()).div(supply);
  }

  function _sharesForAmount(uint256 _amount) internal view returns (uint256) {
    uint256 freeFunds = _freeFunds();
    if (freeFunds > 0) {
      return _amount.mul(totalSupply()).div(freeFunds);
    }
    return 0;
  }

  function _withdrawFromStrategies(uint256 _withdrawValue) internal returns (uint256) {
    uint256 totalLoss = 0;
    uint256 value = _withdrawValue;
    for (uint256 i = 0; i < withdrawQueue.length; i++) {
      address strategyAddress = withdrawQueue[i];
      IStrategy strategyToWithdraw = IStrategy(strategyAddress);
      uint256 vaultBalance = token.balanceOf(address(this));
      if (value <= vaultBalance) {
        // there are enough tokens in the vault now, no need to continue
        break;
      }
      uint256 amountNeeded = value.sub(vaultBalance);
      // NOTE: Don't withdraw more than the debt so that Strategy can still
      // continue to work based on the profits it has
      // NOTE: This means that user will lose out on any profits that each
      // Strategy in the queue would return on next harvest, benefiting others
      if (amountNeeded > strategies[strategyAddress].totalDebt) {
        // we can't withdraw more than what the strategy has borrowed
        amountNeeded = strategies[strategyAddress].totalDebt;
      }
      if (amountNeeded == 0) {
        // nothing to withdraw from the strategy, try the next one
        continue;
      }
      uint256 loss = strategyToWithdraw.withdraw(amountNeeded);
      uint256 withdrawAmount = token.balanceOf(address(this)).sub(vaultBalance);
      if (loss > 0) {
        value = value.sub(loss);
        totalLoss = totalLoss.add(loss);
        _reportLoss(strategyAddress, loss);
      }

      // Reduce the Strategy's debt by the amount withdrawn ("realized returns")
      // NOTE: This doesn't add to returns as it's not earned by "normal means"
      strategies[strategyAddress].totalDebt = strategies[strategyAddress].totalDebt.sub(withdrawAmount);
      totalDebt = totalDebt.sub(withdrawAmount);
    }
    return totalLoss;
  }

  function _reportLoss(address _strategy, uint256 _loss) internal {
    require(strategies[_strategy].totalDebt >= _loss, "invalid loss");
    // make sure we reduce our trust with the strategy by the amount of loss
    if (totalDebtRatio != 0) {
      uint256 originalDebtRatio = strategies[_strategy].debtRatio;
      uint256 ratioChange = _loss.mul(totalDebtRatio).div(totalDebt);
      if (ratioChange > originalDebtRatio) {
        ratioChange = originalDebtRatio;
      }
      strategies[_strategy].debtRatio = originalDebtRatio - ratioChange;
      totalDebtRatio = totalDebtRatio - ratioChange;
    }
    strategies[_strategy].totalLoss = strategies[_strategy].totalLoss.add(_loss);
    strategies[_strategy].totalDebt = strategies[_strategy].totalDebt.sub(_loss);
    totalDebt = totalDebt.sub(_loss);
  }

  function _debtOutstanding(address _strategy) internal view returns (uint256) {
    _validateStrategy(_strategy);
    if (totalDebtRatio == 0) {
      return strategies[_strategy].totalDebt;
    }
    uint256 availableAssets = _totalAsset();
    uint256 strategyLimit = availableAssets.mul(strategies[_strategy].debtRatio).div(MAX_BASIS_POINTS);
    uint256 strategyTotalDebt = strategies[_strategy].totalDebt;

    if (emergencyShutdown) {
      return strategyTotalDebt;
    } else if (strategyTotalDebt <= strategyLimit) {
      return 0;
    } else {
      return strategyTotalDebt.sub(strategyLimit);
    }
  }

  function _assessFees(address _strategy, uint256 _gain) internal returns (uint256) {
    // Issue new shares to cover fees
    // NOTE: In effect, this reduces overall share price by the combined fee
    // NOTE: may throw if Vault.totalAssets() > 1e64, or not called for more than a year
    if (strategies[_strategy].activation == block.timestamp) {
      return 0; // NOTE: Just added, no fees to assess
    }
    if (_gain == 0) {
      // The fees are not charged if there hasn't been any gains reported
      return 0;
    }
    uint256 managementFee_ = _assessManagementFee(_strategy);
    uint256 strategyPerformanceFee_ = _assessStrategyPerformanceFee(_strategy, _gain);
    uint256 totalFee_ = managementFee_ + strategyPerformanceFee_;
    if (totalFee_ > _gain) {
      totalFee_ = _gain;
    }

    if (totalFee_ > 0) {
      // rewards are given in the form of shares of the vault. This will allow further gain if the vault is making more profit.
      // but it does mean the strategist/governance will need to redeem the shares to get the tokens.
      // TODO: should we just transfer the token values to the rewards & strategist instead?
      uint256 rewards_ = _issueSharesForAmount(address(this), totalFee_);
      if (strategyPerformanceFee_ > 0) {
        uint256 strategistReward_ = rewards_.mul(strategyPerformanceFee_).div(totalFee_);
        //TODO: this transfer the rewards to the strategy, not the strategist. How does the strategist get the rewards?
        _transfer(address(this), _strategy, strategistReward_);
      }

      if (balanceOf(address(this)) > 0) {
        _transfer(address(this), rewards, balanceOf(address(this)));
      }
    }
    return totalFee_;
  }

  // calculate the management fee based on TVL.
  function _assessManagementFee(address _strategy) internal view returns (uint256) {
    uint256 duration = block.timestamp - strategies[_strategy].lastReport;
    require(duration > 0, "same block"); // should not be called twice within the same block
    // the managementFee is per year, so only charge the management fee for the period since last time it is charged.
    if (managementFee > 0) {
      uint256 strategyTVL = strategies[_strategy].totalDebt.sub(IStrategy(_strategy).delegatedAssets());
      return strategyTVL.mul(managementFee).div(MAX_BASIS_POINTS).mul(duration).div(SECONDS_PER_YEAR);
    }
    return 0;
  }

  function _assessStrategyPerformanceFee(address _strategy, uint256 _gain) internal view returns (uint256) {
    if (_gain > 0) {
      return _gain.mul(strategies[_strategy].performanceFee).div(MAX_BASIS_POINTS);
    }
    return 0;
  }

  function _creditAvailable(address _strategy) internal view returns (uint256) {
    if (emergencyShutdown) {
      return 0;
    }
    _validateStrategy(_strategy);
    uint256 vaultTotalAsset_ = _totalAsset();
    uint256 vaultTotalDebtLimit_ = vaultTotalAsset_.mul(totalDebtRatio).div(MAX_BASIS_POINTS);
    uint256 vaultTotalDebt_ = totalDebt;

    uint256 strategyDebtLimit_ = vaultTotalAsset_.mul(strategies[_strategy].debtRatio).div(MAX_BASIS_POINTS);
    uint256 strategyTotalDebt_ = strategies[_strategy].totalDebt;
    uint256 strategyMinDebtPerHarvest_ = strategies[_strategy].minDebtPerHarvest;
    uint256 strategyMaxDebtPerHarvest_ = strategies[_strategy].maxDebtPerHarvest;

    if ((strategyDebtLimit_ <= strategyTotalDebt_) || (vaultTotalDebtLimit_ <= vaultTotalDebt_)) {
      return 0;
    }

    uint256 available_ = strategyDebtLimit_.sub(strategyTotalDebt_);
    available_ = available_.min(vaultTotalDebtLimit_.sub(vaultTotalDebt_));
    available_ = available_.min(token.balanceOf(address(this)));

    if (available_ < strategyMinDebtPerHarvest_) {
      return 0;
    } else {
      return available_.min(strategyMaxDebtPerHarvest_);
    }
  }

  function _expectedReturn(address _strategy) internal view returns (uint256) {
    _validateStrategy(_strategy);
    uint256 strategyLastReport_ = strategies[_strategy].lastReport;
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
