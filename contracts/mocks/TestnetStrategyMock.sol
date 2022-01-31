// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../strategies/BaseStrategy.sol";

/// @notice This is mainly used as a mock strategy to deply to testnets.
///  You can transfer tokens to this account to simulate making profits, or withdraw from the strategy to simulate loss.
contract TestnetStrategyMock is BaseStrategy {
  uint256 private previousBalance;

  constructor(
    address _vault,
    address _proposer,
    address _developer,
    address _keeper
  ) BaseStrategy(_vault, _proposer, _developer, _keeper) {}

  function name() external pure override returns (string memory) {
    return "testnet mock strategy";
  }

  function estimatedTotalAssets() public view override returns (uint256) {
    return want.balanceOf(address(this));
  }

  /// @notice call this to transfer tokens from the strategy to the given account to simulate a loss
  function withdraw(address _to, uint256 _amount) external {
    want.transfer(_to, _amount);
  }

  function prepareReturn(uint256 _debtOutstanding)
    internal
    override
    returns (
      uint256 _profit,
      uint256 _loss,
      uint256 _debtPayment
    )
  {
    uint256 currentBalance = estimatedTotalAssets();
    if (currentBalance >= previousBalance) {
      _profit = currentBalance - previousBalance;
    }
    uint256 _debt = IVault(vault).strategy(address(this)).totalDebt;
    if (currentBalance < _debt) {
      _loss = _debt - currentBalance;
      _profit = 0;
    }
    previousBalance = currentBalance;
    if (_debtOutstanding > 0) {
      _debtPayment = Math.min(_debtOutstanding, currentBalance - _profit);
    }
  }

  function adjustPosition(uint256 _debtOutstanding) internal override {
    uint256 currentBalance = estimatedTotalAssets();
    previousBalance = currentBalance;
  }

  function liquidatePosition(uint256 _amountNeeded)
    internal
    override
    returns (uint256 _liquidatedAmount, uint256 _loss)
  {
    uint256 currentBalance = estimatedTotalAssets();
    _liquidatedAmount = currentBalance;
    if (currentBalance < previousBalance) {
      _loss = previousBalance - currentBalance;
    }
    previousBalance = currentBalance;
  }

  function prepareMigration(address _newStrategy) internal override {}

  function protectedTokens() internal view override returns (address[] memory) {}
}
