// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./CurveConvexBase.sol";

contract CurveBtc is CurveConvexBase {
  using SafeERC20 for IERC20;
  using Address for address;

  address private constant WBTC_TOKEN_ADDRESS = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;
  address private constant CURVE_TBTC_METAPOOL_GAUGE_ADDRESS = 0x11137B10C210b579405c21A07489e28F3c040AB1;
  // the LP (meta token) of the renBtc/sBTc/wBTC curve pool
  address private constant CRV_REN_WS_BTC_TOKEN_ADDRESS = 0x075b1bb99792c9E1041bA13afEf80C91a1e70fB3;
  // 0 - oBTC, 1 - renBTC, 2 - WBTC, 3 - sBTC
  uint256 private constant WBTC_TOKEN_INDEX = 2;
  uint256 private constant NUMBER_OF_COINS = 4;

  // address internal constant CURVE_OBTC_POOL_ADDRESS = 0xd5BCf53e2C81e1991570f33Fa881c49EEa570C8D;

  /* solhint-disable  no-empty-blocks */
  /// @dev the _pool here is a zap depositor, which will automatically add/remove liquidity to/from the base and meta pool
  constructor(
    address _vault,
    address _strategist,
    address _rewards,
    address _keeper,
    address _pool
  ) CurveConvexBase(_vault, _strategist, _rewards, _keeper, _pool) {}

  /* solhint-enable */

  function name() external view override returns (string memory) {
    return "CurveWBTC";
  }

  function checkWantToken() internal view virtual override {
    require(address(want) == _getWTBCTokenAddress(), "wrong vault token");
  }

  function _approveBasic() internal override {
    super._approveBasic();
    // the zap depositor pool needs this to add liquidity to the base pool
    IERC20(_getWTBCTokenAddress()).safeApprove(address(curvePool), type(uint256).max);
    // the zap depositor pool needs this to remove LP tokens when remove liquidity
    IERC20(curveGauge.lp_token()).safeApprove(address(curvePool), type(uint256).max);
  }

  function _getWTBCTokenAddress() internal view virtual returns (address) {
    return WBTC_TOKEN_ADDRESS;
  }

  function _getWantTokenIndex() internal view override returns (uint256) {
    return WBTC_TOKEN_INDEX;
  }

  function _getCoinsCount() internal view override returns (uint256) {
    return NUMBER_OF_COINS;
  }

  function _addLiquidityToCurvePool() internal virtual override {
    uint256 balance = _balanceOfWant();
    if (balance > 0) {
      uint256[4] memory params;
      params[WBTC_TOKEN_INDEX] = balance;
      curvePool.add_liquidity(params, 0);
    }
  }

  function _getCurvePoolGaugeAddress() internal view virtual override returns (address) {
    return CURVE_TBTC_METAPOOL_GAUGE_ADDRESS;
  }
}
