// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./CurveEth.sol";
import "./ConvexBase.sol";

contract ConvexEth is CurveEth, ConvexBase {
  using SafeERC20 for IERC20;

  uint256 private constant POOL_ID = 25;

  constructor(
    address _vault,
    address _strategist,
    address _rewards,
    address _keeper,
    address _pool,
    address _booster
  ) CurveEth(_vault, _strategist, _rewards, _keeper, _pool) ConvexBase(POOL_ID, _booster) {}

  function name() external pure override returns (string memory) {
    return "ConvexETH";
  }

  function protectedTokens() internal view virtual override returns (address[] memory) {
    return _buildProtectedTokens(_getCurveTokenAddress());
  }

  function _approveDex() internal virtual override {
    super._approveDex();
    _approveDexExtra(dex);
  }

  function _balanceOfRewards() internal view virtual override returns (uint256) {
    return _convexRewardsValue(_getCurveTokenAddress(), _getQuoteForTokenToWant);
  }

  function _depositLPTokens() internal virtual override {
    _depositToConvex();
  }

  function _claimRewards() internal virtual override {
    _claimConvexRewards(_getCurveTokenAddress(), _swapToWant);
  }

  function _getLpTokenBalance() internal view virtual override returns (uint256) {
    return _getConvexBalance();
  }

  function _removeLpToken(uint256 _amount) internal virtual override {
    _withdrawFromConvex(_amount);
  }

  // no need to do anything
  function onHarvest() internal virtual override {}
}
