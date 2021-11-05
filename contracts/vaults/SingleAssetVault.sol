// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./AccessControlledVault.sol";
import "./BaseVault.sol";

interface ISingleAssetVault is IAccessControlledVault {
  event DepositLimitUpdated(uint256 _limit);

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

  /// @notice all the underlying tokens borrowed by all the strategies
  function totalDebt() external view returns (uint256);

  // *** The following are write functions and can be called by anyone *** //
  /// @notice deposit the given amount into the vault, and return the number of shares
  function deposit(uint256 _amount) external returns (uint256);

  /// @notice burn the given amount of shares from the vault, and return the number of underlying tokens recovered
  function withdraw(
    uint256 _shares,
    address _recipient,
    uint256 _maxLoss
  ) external returns (uint256);

  function setDepositLimit(uint256 _depositLimit) external;

  // *** The following are write functions that can only be called by the strategies *** //
  function report(
    uint256 _gain,
    uint256 _loss,
    uint256 _debtPayment
  ) external returns (uint256);
}

abstract contract SingleAssetVault is BaseVault, AccessControlledVault, Pausable, ReentrancyGuard {
  ERC20 private token;
}
