// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../interfaces/IHealthCheck.sol";
import "../interfaces/IStrategy.sol";
import "./SingleAssetVaultBase.sol";
import "../access/AccessControlManager.sol";

contract SingleAssetVault is SingleAssetVaultBase, Pausable, ReentrancyGuard, AccessControlManager {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

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

  uint256 internal constant SECONDS_PER_YEAR = 31_556_952; // 365.2425 days

  /// @dev construct a vault using a single asset.
  /// @param _name the name of the vault
  /// @param _symbol the symbol of the vault
  /// @param _governance the address of the manager of the vault
  /// @param _token the address of the token asset
  /* solhint-disable no-empty-blocks */
  constructor(
    string memory _name,
    string memory _symbol,
    address _governance,
    address _gatekeeper,
    address _rewards,
    address _strategyDataStoreAddress,
    address _token
  )
    SingleAssetVaultBase(_name, _symbol, _governance, _gatekeeper, _rewards, _strategyDataStoreAddress, _token)
    AccessControlManager(new address[](0))
  {
    _pause();
  }

  /* solhint-enable */

  function pause() external {
    _onlyGovernanceOrGatekeeper();
    _pause();
  }

  function unpause() external {
    _onlyGovernanceOrGatekeeper();
    _unpause();
  }

  function addAccessControlPolicies(address[] calldata _policies) external {
    _onlyGovernanceOrGatekeeper();
    _addAccessControlPolicys(_policies);
  }

  function removeAccessControlPolicies(address[] calldata _policies) external {
    _onlyGovernanceOrGatekeeper();
    _removeAccessControlPolicys(_policies);
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
  /// @param _recipient the address that will receive the vault shares
  /// @return The issued Vault shares.
  function deposit(uint256 _amount, address _recipient) external whenNotPaused nonReentrant returns (uint256) {
    _onlyNotEmergencyShutdown();
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
  /// @param _recipient The address to issue the shares in this Vault to.
  /// @param _maxLoss The maximum acceptable loss to sustain on withdrawal in basis points.
  /// @return The quantity of tokens redeemed for `_shares`.
  function withdraw(
    uint256 _maxShares,
    address _recipient,
    uint256 _maxLoss
  ) external whenNotPaused nonReentrant returns (uint256) {
    _onlyNotEmergencyShutdown();
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

    _checkStrategyHealth(callerStrategy, _gain, _loss, _debtPayment);

    _reportLoss(callerStrategy, _loss);
    // Returns are always "realized gains"
    strategies[callerStrategy].totalGain = strategies[callerStrategy].totalGain.add(_gain);

    // Assess both management fee and performance fee, and issue both as shares of the vault
    uint256 totalFees = _assessFees(callerStrategy, _gain);
    // Compute the line of credit the Vault is able to offer the Strategy (if any)
    uint256 credit = _creditAvailable(callerStrategy);
    // Outstanding debt the Strategy wants to take back from the Vault (if any)
    // NOTE: debtOutstanding <= StrategyInfo.totalDebt
    uint256 debt = _debtOutstanding(callerStrategy);
    uint256 debtPayment = Math.min(debt, _debtPayment);

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

    _updateLockedProfit(_gain, totalFees, _loss);
    // solhint-disable-next-line not-rely-on-time
    strategies[callerStrategy].lastReport = block.timestamp;
    // solhint-disable-next-line not-rely-on-time
    lastReport = block.timestamp;

    StrategyInfo memory info = strategies[callerStrategy];
    uint256 strategyDebtRatio = _strategyDataStore().strategyDebtRatio(address(this), callerStrategy);
    emit StrategyReported(
      callerStrategy,
      _gain,
      _loss,
      debtPayment,
      info.totalGain,
      info.totalLoss,
      info.totalDebt,
      credit,
      strategyDebtRatio
    );

    if (strategyDebtRatio == 0 || emergencyShutdown) {
      // Take every last penny the Strategy has (Emergency Exit/revokeStrategy)
      // NOTE: This is different than `debt` in order to extract *all* of the returns
      return IStrategy(callerStrategy).estimatedTotalAssets();
    } else {
      // Otherwise, just return what we have as debt outstanding
      return debt;
    }
  }

  function _deposit(uint256 _amount, address _recipient) internal returns (uint256) {
    require(_recipient != address(0), "invalid recipient");
    require(_hasAccess(_msgSender(), address(this)), "no access");
    //TODO: do we also want to cap the `_amount` too?
    uint256 amount = _ensureValidDepositAmount(_msgSender(), _amount);
    uint256 shares = _issueSharesForAmount(_recipient, amount);
    token.safeTransferFrom(_msgSender(), address(this), amount);
    return shares;
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
    _mint(_recipient, shares);
    return shares;
  }

  function _assessFees(address _strategy, uint256 _gain) internal returns (uint256) {
    uint256 totalFee_;
    uint256 performanceFee_;
    (totalFee_, performanceFee_) = _calculateFees(_strategy, _gain);

    if (totalFee_ > 0) {
      // rewards are given in the form of shares of the vault. This will allow further gain if the vault is making more profit.
      // but it does mean the strategist/governance will need to redeem the shares to get the tokens.
      // TODO: should we just transfer the token values to the rewards & strategist instead?
      uint256 rewards_ = _issueSharesForAmount(address(this), totalFee_);
      if (performanceFee_ > 0) {
        uint256 strategistReward_ = rewards_.mul(performanceFee_).div(totalFee_);
        //TODO: this transfer the rewards to the strategy, not the strategist. How does the strategist get the rewards?
        _transfer(address(this), _strategy, strategistReward_);
      }

      if (balanceOf(address(this)) > 0) {
        _transfer(address(this), rewards, balanceOf(address(this)));
      }
    }
    return totalFee_;
  }

  function _withdraw(
    uint256 _maxShares,
    address _recipient,
    uint256 _maxLoss
  ) internal returns (uint256) {
    require(_recipient != address(0), "invalid recipient");
    require(_maxLoss <= MAX_BASIS_POINTS, "invalid maxLoss");
    uint256 shares = _ensureValidShares(_msgSender(), _maxShares);
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
      if (totalLoss > 0) {
        value = value.sub(totalLoss);
      }
      vaultBalance = token.balanceOf(address(this));
    }
    // NOTE: We have withdrawn everything possible out of the withdrawal queue,
    // but we still don't have enough to fully pay them back, so adjust
    // to the total amount we've freed up through forced withdrawals
    if (value > vaultBalance) {
      value = vaultBalance;
      // NOTE: Burn # of shares that corresponds to what Vault has on-hand,
      // including the losses that were incurred above during withdrawals
      shares = _sharesForAmount(value.add(totalLoss));
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

  function _withdrawFromStrategies(uint256 _withdrawValue) internal returns (uint256) {
    uint256 totalLoss = 0;
    uint256 value = _withdrawValue;
    address[] memory withdrawQueue = _strategyDataStore().withdrawQueue(address(this));
    for (uint256 i = 0; i < withdrawQueue.length; i++) {
      address strategyAddress = withdrawQueue[i];
      IStrategy strategyToWithdraw = IStrategy(strategyAddress);
      uint256 vaultBalance = token.balanceOf(address(this));
      if (value <= vaultBalance) {
        // there are enough tokens in the vault now, no need to continue
        break;
      }
      // NOTE: Don't withdraw more than the debt so that Strategy can still
      // continue to work based on the profits it has
      // NOTE: This means that user will lose out on any profits that each
      // Strategy in the queue would return on next harvest, benefiting others
      uint256 amountNeeded = Math.min(value.sub(vaultBalance), strategies[strategyAddress].totalDebt);
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
      _decreaseDebt(strategyAddress, withdrawAmount);
    }
    return totalLoss;
  }

  function _reportLoss(address _strategy, uint256 _loss) internal {
    if (_loss > 0) {
      require(strategies[_strategy].totalDebt >= _loss, "invalid loss");
      uint256 totalDebtRatio_ = _strategyDataStore().vaultTotalDebtRatio(address(this));
      uint256 strategyDebtRatio_ = _strategyDataStore().strategyDebtRatio(address(this), _strategy);
      // make sure we reduce our trust with the strategy by the amount of loss
      if (totalDebtRatio_ != 0) {
        uint256 ratioChange_ = Math.min(_loss.mul(totalDebtRatio_).div(totalDebt), strategyDebtRatio_);
        _strategyDataStore().updateStrategyDebtRatio(address(this), _strategy, strategyDebtRatio_ - ratioChange_);
      }
      strategies[_strategy].totalLoss = strategies[_strategy].totalLoss.add(_loss);
      strategies[_strategy].totalDebt = strategies[_strategy].totalDebt.sub(_loss);
      totalDebt = totalDebt.sub(_loss);
    }
  }

  function _assessStrategyPerformanceFee(address _strategy, uint256 _gain) internal view returns (uint256) {
    return _gain.mul(_strategyDataStore().strategyPerformanceFee(address(this), _strategy)).div(MAX_BASIS_POINTS);
  }

  // calculate the management fee based on TVL.
  function _assessManagementFee(address _strategy) internal view returns (uint256) {
    // solhint-disable-next-line not-rely-on-time
    uint256 duration = block.timestamp - strategies[_strategy].lastReport;
    require(duration > 0, "same block"); // should not be called twice within the same block
    // the managementFee is per year, so only charge the management fee for the period since last time it is charged.
    if (managementFee > 0) {
      uint256 strategyTVL = strategies[_strategy].totalDebt.sub(IStrategy(_strategy).delegatedAssets());
      return strategyTVL.mul(managementFee).div(MAX_BASIS_POINTS).mul(duration).div(SECONDS_PER_YEAR);
    }
    return 0;
  }

  function _ensureValidShares(address _account, uint256 _shares) internal view returns (uint256) {
    uint256 shares = _shares;
    uint256 balance = balanceOf(_account);
    if (shares > balance) {
      shares = balance;
    }
    require(shares > 0, "no shares");
    return shares;
  }

  function _increaseDebt(address _strategy, uint256 _amount) internal {
    strategies[_strategy].totalDebt = strategies[_strategy].totalDebt.add(_amount);
    totalDebt = totalDebt.add(_amount);
  }

  function _decreaseDebt(address _strategy, uint256 _amount) internal {
    strategies[_strategy].totalDebt = strategies[_strategy].totalDebt.sub(_amount);
    totalDebt = totalDebt.sub(_amount);
  }

  function _checkStrategyHealth(
    address _strategy,
    uint256 _gain,
    uint256 _loss,
    uint256 _debtPayment
  ) internal {
    if (healthCheck != address(0)) {
      IHealthCheck check = IHealthCheck(healthCheck);
      if (check.doHealthCheck(_strategy)) {
        require(
          check.check(
            _strategy,
            _gain,
            _loss,
            _debtPayment,
            _debtOutstanding(_strategy),
            strategies[_strategy].totalDebt
          ),
          "strategy is not healthy"
        );
      } else {
        check.enableCheck(_strategy);
      }
    }
  }

  function _calculateFees(address _strategy, uint256 _gain)
    internal
    view
    returns (uint256 totalFee, uint256 performanceFee)
  {
    // Issue new shares to cover fees
    // NOTE: In effect, this reduces overall share price by the combined fee
    // NOTE: may throw if Vault.totalAssets() > 1e64, or not called for more than a year
    // solhint-disable-next-line not-rely-on-time
    if (strategies[_strategy].activation == block.timestamp) {
      return (0, 0); // NOTE: Just added, no fees to assess
    }
    if (_gain == 0) {
      // The fees are not charged if there hasn't been any gains reported
      return (0, 0);
    }
    uint256 managementFee_ = _assessManagementFee(_strategy);
    uint256 strategyPerformanceFee_ = _assessStrategyPerformanceFee(_strategy, _gain);
    uint256 totalFee_ = managementFee_ + strategyPerformanceFee_;
    if (totalFee_ > _gain) {
      totalFee_ = _gain;
    }
    return (totalFee_, strategyPerformanceFee_);
  }

  function _ensureValidDepositAmount(address _account, uint256 _amount) internal view returns (uint256) {
    uint256 amount = _amount;
    uint256 balance = token.balanceOf(_account);
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

  function _updateLockedProfit(
    uint256 _gain,
    uint256 _totalFees,
    uint256 _loss
  ) internal {
    // Profit is locked and gradually released per block
    // NOTE: compute current locked profit and replace with sum of current and new
    uint256 locakedProfileBeforeLoss = _calculateLockedProfit() + _gain - _totalFees;
    if (locakedProfileBeforeLoss > _loss) {
      lockedProfit = locakedProfileBeforeLoss.sub(_loss);
    } else {
      lockedProfit = 0;
    }
  }
}
