// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./CurveBaseV2.sol";
import "hardhat/console.sol";

contract CurveERC20SinglePool is CurveBaseV2 {
  using SafeERC20 for IERC20;
  using Address for address;

  /// @dev the number of tokens of the Curve plain pool
  uint8 public immutable numberOfTokens;
  /// @dev the index of the token this strategy will add to the Curve pool
  uint8 public immutable inputTokenIndex;
  /// @dev the address of the token that this strategy will add to the Curve pool.
  /// It should be the same as the `want` token of this strategy.
  address public immutable inputTokenAddress;
  bool public immutable isZapDepositor;

  /// @param _vault the address of the vault for this strategy
  /// @param _proposer the address of the proposer for this strategy. Can be address(0).
  /// @param _developer the address of the developer for this strategy. Can be address(0).
  /// @param _harvester the address of the harvester for this strategy
  /// @param _pool the address of the Curve pool
  /// @param _gauge the address of the gauge
  /// @param _numberOfPoolTokens the total number of input tokens for this Curve pool
  /// @param _inputTokenIndex the index of the token this strategy will add to the Curve pool
  /// @param _inputTokenAddress the address of the token that this strategy will add to the Curve pool.
  /// @param _isZapDepositor if the pool is a zap depositor
  constructor(
    address _vault,
    address _proposer,
    address _developer,
    address _harvester,
    address _pool,
    address _gauge,
    uint8 _numberOfPoolTokens,
    uint8 _inputTokenIndex,
    address _inputTokenAddress,
    bool _isZapDepositor
  ) CurveBaseV2(_vault, _proposer, _developer, _harvester, _pool, _gauge) {
    {
      require(_numberOfPoolTokens > 0, "!poolToken");
      require(_inputTokenIndex < _numberOfPoolTokens, "!inputTokenIndex");
      require(address(want) == _inputTokenAddress, "!inputToken");
    }
    {
      numberOfTokens = _numberOfPoolTokens;
      inputTokenIndex = _inputTokenIndex;
      inputTokenAddress = _inputTokenAddress;
      isZapDepositor = _isZapDepositor;
    }
    {
      _approveCurveExtra();
    }
  }

  function name() external view virtual override returns (string memory) {
    return "CurveERC20SinglePool";
  }

  function _approveCurveExtra() internal {
    // the pool needs this to add liquidity to the base pool
    IERC20(inputTokenAddress).safeApprove(address(curvePool), type(uint256).max);
    if (isZapDepositor) {
      // the zap depositor pool needs this to remove LP tokens when remove liquidity
      IERC20(curveGauge.lp_token()).safeApprove(address(curvePool), type(uint256).max);
    }
  }

  function _getWantTokenIndex() internal view override returns (uint256) {
    return inputTokenIndex;
  }

  function _getCoinsCount() internal view virtual override returns (uint256) {
    return numberOfTokens;
  }

  function _addLiquidityToCurvePool() internal virtual override {
    uint256 balance = _balanceOfWant();
    if (balance > 0) {
      if (numberOfTokens == 2) {
        uint256[2] memory params;
        params[inputTokenIndex] = balance;
        curvePool.add_liquidity(params, 0);
      } else if (numberOfTokens == 3) {
        uint256[3] memory params;
        params[inputTokenIndex] = balance;
        curvePool.add_liquidity(params, 0);
      } else if (numberOfTokens == 4) {
        uint256[4] memory params;
        params[inputTokenIndex] = balance;
        curvePool.add_liquidity(params, 0);
      }
    }
  }

  function _balanceOfPoolInputToken() internal view virtual override returns (uint256) {
    return _balanceOfWant();
  }
}
