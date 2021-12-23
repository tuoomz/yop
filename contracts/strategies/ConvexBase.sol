// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/convex/IConvexDeposit.sol";
import "../interfaces/convex/IConvexRewards.sol";
import "hardhat/console.sol";

contract ConvexBase {
  using SafeERC20 for IERC20;

  address private constant CONVEX_TOKEN_ADDRESS = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;

  uint256 public poolId;
  address public convexBooster;
  address public cvxRewards;
  address public lpToken;

  constructor(uint256 _pooId, address _booster) {
    require(_booster != address(0), "invalid booster address");
    poolId = _pooId;
    convexBooster = _booster;
    (lpToken, , , cvxRewards, , ) = IConvexDeposit(convexBooster).poolInfo(poolId);
    _approveConvexExtra();
  }

  function _approveConvexExtra() internal {
    IERC20(lpToken).safeApprove(convexBooster, type(uint256).max);
  }

  function _approveDexExtra(address _dex) internal {
    IERC20(_getConvexTokenAddress()).safeApprove(_dex, type(uint256).max);
  }

  function _buildProtectedTokens(address _curveToken) internal view returns (address[] memory) {
    address[] memory protected = new address[](3);
    protected[0] = _curveToken;
    protected[1] = _getConvexTokenAddress();
    protected[2] = lpToken;
    return protected;
  }

  function _depositToConvex() internal {
    uint256 balance = IERC20(lpToken).balanceOf(address(this));
    if (balance > 0) {
      IConvexDeposit(convexBooster).depositAll(poolId, true);
    }
  }

  function _getConvexBalance() internal view returns (uint256) {
    return IConvexRewards(cvxRewards).balanceOf(address(this));
  }

  function _withdrawFromConvex(uint256 _amount) internal {
    IConvexRewards(cvxRewards).withdrawAndUnwrap(_amount, true);
  }

  function _getConvexTokenAddress() internal view virtual returns (address) {
    return CONVEX_TOKEN_ADDRESS;
  }

  function _claimConvexRewards(address _curveTokenAddress, function(address, uint256) returns (uint256) _swapFunc)
    internal
    virtual
  {
    IConvexRewards(cvxRewards).getReward(address(this), true);
    uint256 crvBalance = IERC20(_curveTokenAddress).balanceOf(address(this));
    uint256 convexBalance = IERC20(_getConvexTokenAddress()).balanceOf(address(this));
    _swapFunc(_curveTokenAddress, crvBalance);
    _swapFunc(_getConvexTokenAddress(), convexBalance);
  }

  /// @dev calculate the value of the convex rewards in want token.
  ///  It will calculate how many CVX tokens can be claimed based on the _crv amount and then swap them to want
  function _convexRewardsValue(address _curveTokenAddress, function(address, uint256) view returns (uint256) _quoteFunc)
    internal
    view
    returns (uint256)
  {
    uint256 _crv = IConvexRewards(cvxRewards).earned(address(this));
    if (_crv > 0) {
      // calculations pulled directly from CVX's contract for minting CVX per CRV claimed
      uint256 totalCliffs = 1000;
      uint256 maxSupply = 1e8 * 1e18; // 100m
      uint256 reductionPerCliff = 1e5 * 1e18; // 100k
      uint256 supply = IERC20(_getConvexTokenAddress()).totalSupply();
      uint256 _cvx;

      uint256 cliff = supply / reductionPerCliff;
      // mint if below total cliffs
      if (cliff < totalCliffs) {
        // for reduction% take inverse of current cliff
        uint256 reduction = totalCliffs - cliff;
        // reduce
        _cvx = (_crv * reduction) / totalCliffs;

        // supply cap check
        uint256 amtTillMax = maxSupply - supply;
        if (_cvx > amtTillMax) {
          _cvx = amtTillMax;
        }
      }
      uint256 rewardsValue;
      if (_crv > 0) {
        rewardsValue += _quoteFunc(_curveTokenAddress, _crv);
      }
      if (_cvx > 0) {
        rewardsValue += _quoteFunc(_getConvexTokenAddress(), _cvx);
      }
      return rewardsValue;
    }
    return 0;
  }
}
