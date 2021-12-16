// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/utils/Address.sol";
import "./CurveBase.sol";

interface IWETH {
  function withdraw(uint256) external;

  function deposit(uint256) external;
}

contract CurveEth is CurveBase {
  using SafeERC20 for IERC20;
  using Address for address;

  // address internal constant CURVE_STETH_POOL_ADDRESS = 0xDC24316b9AE028F1497c275EB9192a3Ea0f67022;

  constructor(
    address _vault,
    address _strategist,
    address _rewards,
    address _keeper,
    address _pool
  ) CurveBase(_vault, _strategist, _rewards, _keeper, _pool) {}

  function name() external view override returns (string memory) {
    return "CurveStEth";
  }

  function checkWantToken() internal view virtual override {
    require(address(want) == _getWETHTokenAddress(), "wrong vault token");
  }

  function _addLiquidityToCurvePool() internal virtual override {
    uint256 wethBalance = _balanceOfWant();
    if (wethBalance > 0) {
      // covert weth to eth
      IWETH(_getWETHTokenAddress()).withdraw(wethBalance);
      // only send the amount of eth that is unwrapped from weth, not all the available eth incase the strategy have some of it's own eth for gas fees
      uint256[2] memory params = [wethBalance, 0];
      curvePool.add_liquidity(params, 0);
      bytes memory data = abi.encodeWithSignature("add_liquidity(uint256[2], uint256)", params, 0);
      address(curvePool).functionCallWithValue(data, wethBalance, "deposit failed");
    }
  }

  function _balanceOfPool() internal view virtual override returns (uint256) {
    uint256 lpTokenAmount = curveGauge.balanceOf(address(this));
    // we will get the eth amount, which is the same as weth
    uint256 outputAmount = curvePool.calc_withdraw_one_coin(lpTokenAmount, int128(0));
    return outputAmount;
  }

  function _withdrawSome(uint256 _amount) internal virtual override returns (uint256) {
    // check how many LP tokens we will need for the given want _amount
    uint256 requiredLPTokenAmount = (curvePool.calc_token_amount([_amount, 0], true) * 200) / 10000; // adding 2% for slippage cost
    // decide how many LP tokens we can actually withdraw
    uint256 withdrawLPTokenAmount = Math.min(requiredLPTokenAmount, curveGauge.balanceOf(address(this)));
    // withdraw this amount of token from the gauge first
    curveGauge.withdraw(withdrawLPTokenAmount);
    // then remove the liqudity from the pool, will get eth back
    uint256 amount = curvePool.remove_liquidity_one_coin(withdrawLPTokenAmount, 0, 0);
    // wrapp the eth to weth
    IWETH(_getWETHTokenAddress()).deposit(amount);
    return amount;
  }
}
