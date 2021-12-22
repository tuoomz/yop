// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../strategies/CurveStable.sol";
import "../interfaces/convex/IConvexDeposit.sol";
import "../interfaces/convex/IConvexRewards.sol";

contract ConvexStable is CurveStable {
  using SafeERC20 for IERC20;

  uint256 private constant POOL_ID = 13;
  address public convexBooster;
  address public cvxRewards;
  address public lpToken;

  constructor(
    address _vault,
    address _strategist,
    address _rewards,
    address _keeper,
    address _pool,
    address _booster
  ) CurveStable(_vault, _strategist, _rewards, _keeper, _pool, 3) {
    require(_booster != address(0), "invalid booster address");
    convexBooster = _booster;
    (lpToken, , , cvxRewards, , ) = IConvexDeposit(convexBooster).poolInfo(POOL_ID);
  }

  function name() external pure override returns (string memory) {
    return "ConvexUSDC";
  }

  function protectedTokens() internal view virtual override returns (address[] memory) {
    address[] memory protected = new address[](3);
    protected[0] = _getCurveTokenAddress();
    protected[1] = _getConvexTokenAddress();
    protected[2] = lpToken;
    return protected;
  }

  function _approveDex() internal virtual override {
    super._approveDex();
    IERC20(_getConvexTokenAddress()).safeApprove(dex, type(uint256).max);
  }

  function _balanceOfPool() internal view virtual override returns (uint256) {
    // get staked cvxusdn3crv
    uint256 convexBalance = IConvexRewards(cvxRewards).balanceOf(address(this));
    // staked covex converts 1 to 1 to usdn3crv so no need to calc
    // convert usdn3crv to want
    if (convexBalance > 0) {
      return _quoteWantInMetapoolLp(convexBalance);
    } else {
      return 0;
    }
  }

  function _balanceOfRewards() internal view virtual override returns (uint256) {
    uint256 _crv = IConvexRewards(cvxRewards).earned(address(this));
    return _convexRewardsValue(_crv);
  }

  function _depositLPTokens() internal virtual override {
    uint256 balance = IERC20(lpToken).balanceOf(address(this));
    if (balance > 0) {
      IConvexDeposit(convexBooster).depositAll(POOL_ID, true);
    }
  }

  function _claimRewards() internal virtual override {
    IConvexRewards(cvxRewards).getReward(address(this), true);
    uint256 crvBalance = IERC20(_getCurveTokenAddress()).balanceOf(address(this));
    uint256 convexBalance = IERC20(_getConvexTokenAddress()).balanceOf(address(this));
    _swapToWant(_getCurveTokenAddress(), crvBalance);
    _swapToWant(_getConvexTokenAddress(), convexBalance);
  }

  function _getLpTokenBalance() internal virtual override returns (uint256) {
    return IConvexRewards(cvxRewards).balanceOf(address(this));
  }

  function _removeLpToken(uint256 _amount) internal virtual override {
    IConvexRewards(cvxRewards).withdrawAndUnwrap(_amount, true);
  }

  // no need to do anything
  function onHarvest() internal virtual override {}
}
