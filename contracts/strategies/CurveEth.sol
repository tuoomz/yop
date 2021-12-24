// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./CurveBase.sol";

interface IWETH is IERC20 {
  function withdraw(uint256 wad) external;

  function deposit(uint256) external payable;
}

/// @notice Implements the strategy using the ETH/stETH swap pool.
///  The strategy will take wETH as the input token, swap them to ETH, and then add liquidity to the ETH/stETH pool.
///  Then the strategy will deposit the LP tokens into the gauge.
///  Input token: wETH
///  Base pool: 0xDC24316b9AE028F1497c275EB9192a3Ea0f67022 (ETH/stEH pool)
///  Gauge: 0x182B723a58739a9c974cFDB385ceaDb237453c28
contract CurveEth is CurveBase {
  using SafeERC20 for IERC20;
  using Address for address;

  // address internal constant CURVE_STETH_POOL_ADDRESS = 0xDC24316b9AE028F1497c275EB9192a3Ea0f67022;
  uint256 private constant NUMBER_OF_COINS = 2;
  uint256 private constant ETH_TOKEN_INDEX = 0;

  /* solhint-disable  no-empty-blocks */
  constructor(
    address _vault,
    address _strategist,
    address _rewards,
    address _keeper,
    address _pool
  ) CurveBase(_vault, _strategist, _rewards, _keeper, _pool) {}

  /* solhint-enable */

  function name() external view virtual override returns (string memory) {
    return "CurveStEth";
  }

  function checkWantToken() internal view virtual override {
    require(address(want) == _getWETHTokenAddress(), "wrong vault token");
  }

  function _getWantTokenIndex() internal view override returns (uint256) {
    return ETH_TOKEN_INDEX;
  }

  function _getCoinsCount() internal view override returns (uint256) {
    return NUMBER_OF_COINS;
  }

  function _addLiquidityToCurvePool() internal virtual override {
    uint256 wethBalance = _balanceOfWant();
    if (wethBalance > 0) {
      // covert weth to eth
      IWETH(_getWETHTokenAddress()).withdraw(wethBalance);
      // only send the amount of eth that is unwrapped from weth, not all the available eth incase the strategy have some of it's own eth for gas fees
      uint256[2] memory params = [wethBalance, 0];
      curvePool.add_liquidity{value: wethBalance}(params, 0);
    }
  }

  /// @dev Remove the liquidity by the LP token amount
  /// @param _amount The amount of LP token (not want token)
  function _removeLiquidity(uint256 _amount) internal override returns (uint256) {
    uint256 amount = super._removeLiquidity(_amount);
    // wrapp the eth to weth
    IWETH(_getWETHTokenAddress()).deposit{value: amount}(amount);
    return amount;
  }

  /// @dev This is needed in order to receive eth that will be returned by WETH contract
  // solhint-disable-next-line
  receive() external payable {}
}
