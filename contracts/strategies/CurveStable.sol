// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "../interfaces/curve/ICurveDeposit.sol";
import "../interfaces/curve/ICurveGauge.sol";
import "../interfaces/curve/ICurveMinter.sol";
import "../interfaces/sushiswap/IUniswapV2Router.sol";

import "./CurveBase.sol";

import "hardhat/console.sol";

contract CurveStable is CurveBase {
  using SafeERC20 for IERC20;
  using Address for address;

  address internal constant USDN_METAPOOL = address(0x0f9cb53Ebe405d49A0bbdBD291A65Ff571bC83e1);
  IERC20 internal constant USDN_3CRV = IERC20(0x4f3E8F405CF5aFC05D68142F3783bDfE13811522);
  IERC20 internal constant THREE_CRV = IERC20(0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490);

  ICurveDeposit internal usdnMetaPool;
  IERC20 internal triPoolLpToken;
  int128 internal wantThreepoolIndex;
  uint256 internal nPoolCoins;

  constructor(
    address _vault,
    address _strategist,
    address _rewards,
    address _keeper,
    address _pool,
    uint256 _nPoolCoins
  ) CurveBase(_vault, _strategist, _rewards, _keeper, _pool) {
    // threePool = 0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7;
    // usdnMetaPool = 0x0f9cb53Ebe405d49A0bbdBD291A65Ff571bC83e1;
    // curveGauge = address(0xF98450B5602fa59CC66e1379DFfB6FDDc724CfC4);
    // curveMinter = address(0xd061D61a4d941c39E5453435B6345Dc261C2fcE0);

    usdnMetaPool = ICurveDeposit(_getMetaPool());
    triPoolLpToken = _getTriPoolLpToken();
    nPoolCoins = _nPoolCoins;
    wantThreepoolIndex = _getWantIndexInCurvePool(_pool);
  }

  function name() external view virtual override returns (string memory) {
    return string(abi.encodePacked("CurveStable_", IERC20Metadata(address(want)).symbol()));
  }

  function _getMetaPool() internal view virtual returns (address) {
    return USDN_METAPOOL;
  }

  function _getTriPoolLpToken() internal view virtual returns (IERC20) {
    return THREE_CRV;
  }

  function _getMetaPoolLpToken() internal view virtual returns (IERC20) {
    return USDN_3CRV;
  }

  function _getWantTokenIndex() internal view override returns (uint256) {
    return uint128(wantThreepoolIndex);
  }

  function _getCoinsCount() internal view override returns (uint256) {
    return nPoolCoins;
  }

  function _getWantIndexInCurvePool(address _pool) internal view returns (int128) {
    address _candidate;
    for (uint256 i = 0; i < nPoolCoins; i++) {
      _candidate = ICurveDeposit(_pool).coins(uint256(i));
      if (address(want) == _candidate) {
        return int128(uint128(i));
      }
    }
    revert("Want token doesnt match any tokens in the curve pool");
  }

  function _balanceOfPool() internal view virtual override returns (uint256) {
    uint256 lpTokenAmount = curveGauge.balanceOf(address(this));
    // we will get the eth amount, which is the same as weth
    if (lpTokenAmount > 0) {
      uint256 outputAmount = _quoteWantInMetapoolLp(lpTokenAmount);
      return outputAmount;
    }
    return 0;
  }

  function _quoteWantInMetapoolLp(uint256 _metaPoolLpTokens) public view returns (uint256) {
    uint256 _3crvInUsdn3crv = usdnMetaPool.calc_withdraw_one_coin(_metaPoolLpTokens, 1);
    uint256 _wantIn3crv = curvePool.calc_withdraw_one_coin(_3crvInUsdn3crv, wantThreepoolIndex);
    return _wantIn3crv;
  }

  function _addLiquidityToCurvePool() internal virtual override {
    uint256 _wantBalance = _balanceOfWant();
    if (_wantBalance > 0) {
      uint256[3] memory _tokens = _buildDepositArray(_wantBalance);
      console.log("  threePool.add_liquidity() %s %s %s", _tokens[0], _tokens[1], _tokens[2]);
      curvePool.add_liquidity(_tokens, 1);
    }
  }

  function _buildDepositArray(uint256 _amount) public view returns (uint256[3] memory) {
    uint256[3] memory _tokenBins;
    _tokenBins[uint128(wantThreepoolIndex)] = _amount;
    return _tokenBins;
  }

  function _withdrawSome(uint256 _amount) internal override returns (uint256) {
    uint256 requiredTriPoollLpTokens = curvePool.calc_token_amount(_buildDepositArray(_amount), true);
    uint256 requiredMetaPoollLpTokens = (usdnMetaPool.calc_token_amount([0, requiredTriPoollLpTokens], true) * 10200) /
      10000; // adding 2% for fees
    uint256 liquidated = _removeLiquidity(requiredMetaPoollLpTokens);
    return liquidated;
  }

  /// @dev Remove the liquidity by the LP token amount
  /// @param _amount The amount of LP token (not want token)
  function _removeLiquidity(uint256 _amount) internal override returns (uint256) {
    uint256 _before = _balanceOfWant();
    uint256 lpBalance = _getLpTokenBalance();
    uint256 withdrawAmount = Math.min(lpBalance, _amount);
    // withdraw this amount of token from the gauge first
    _removeLpToken(withdrawAmount);
    // then remove the liqudity from the pool, will get eth back
    uint256 usdn3crv = _getMetaPoolLpToken().balanceOf(address(this));
    usdnMetaPool.remove_liquidity_one_coin(usdn3crv, 1, uint256(0));
    uint256 _3crv = _getTriPoolLpToken().balanceOf(address(this));
    ICurveDepositTrio(address(curvePool)).remove_liquidity_one_coin(_3crv, wantThreepoolIndex, 0);
    return _balanceOfWant() - _before;
  }
}
