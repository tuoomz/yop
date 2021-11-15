// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IVault.sol";

contract StrategyMock {
  using SafeERC20 for IERC20;

  address public vault;
  uint256 public profit;
  uint256 public loss;
  uint256 public debtPayment;
  uint256 public estimatedTotalAssets;
  uint256 public returnAmount;

  address internal tokenAddress;
  IERC20 public token;

  constructor(address _token) {
    tokenAddress = _token;
    token = IERC20(_token);
  }

  // solhint-disable-next-line
  function migrate(address _newStrategy) external {}

  function setVault(address _vault) external {
    vault = _vault;
    if (tokenAddress != address(0)) {
      token.approve(vault, type(uint256).max);
    }
  }

  function setProfit(uint256 _profit) external {
    profit = _profit;
  }

  function setLoss(uint256 _loss) external {
    loss = _loss;
  }

  function setDebtPayment(uint256 _debtPayment) external {
    debtPayment = _debtPayment;
  }

  function setEstimatedTotalAssets(uint256 _totalAssets) external {
    estimatedTotalAssets = _totalAssets;
  }

  function callVault() external {
    IVault(vault).report(profit, loss, debtPayment);
  }

  function setReturnAmount(uint256 _returnAmount) external {
    returnAmount = _returnAmount;
  }

  // solhint-disable-next-line no-unused-vars
  function withdraw(uint256 _amount) external returns (uint256) {
    SafeERC20.safeTransfer(token, msg.sender, returnAmount);
    return loss;
  }

  function delegatedAssets() external pure returns (uint256) {
    return 0;
  }
}
