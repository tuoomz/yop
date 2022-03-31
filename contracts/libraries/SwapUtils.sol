// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router01.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";

library SwapUtils {
  function pairExists(
    address _uniswapRouter,
    address _tokenA,
    address _tokenB
  ) internal view returns (bool) {
    // the order of the tokens doesn't matter, the factory can using either combination
    return IUniswapV2Factory(IUniswapV2Router01(_uniswapRouter).factory()).getPair(_tokenA, _tokenB) != address(0);
  }

  function getAmountsOut(
    address _uniswapRouter,
    address _wethAddress,
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut
  ) internal view returns (uint256) {
    address[] memory path = getSwapPath(_uniswapRouter, _wethAddress, _tokenIn, _tokenOut);
    uint256[] memory out = IUniswapV2Router01(_uniswapRouter).getAmountsOut(_amountIn, path);
    return out[path.length - 1];
  }

  function getSwapPath(
    address _uniswapRouter,
    address _wethAddress,
    address _tokenIn,
    address _tokenOut
  ) internal view returns (address[] memory) {
    address[] memory path;
    bool exists = pairExists(_uniswapRouter, _tokenIn, _tokenOut);
    if (exists) {
      path = new address[](2);
      path[0] = _tokenIn;
      path[1] = _tokenOut;
    } else {
      // use WETH as the intermediary.
      path = new address[](3);
      path[0] = _tokenIn;
      path[1] = _wethAddress;
      path[2] = _tokenOut;
    }
    return path;
  }
}
