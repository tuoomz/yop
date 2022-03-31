// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../strategies/curvev2/CurveMeta.sol";
import "hardhat/console.sol";

contract CurveMetaStrategyMock is CurveMeta {
  address public curveTokenAddress;
  address public metapoolLpToken;
  IERC20 public _triPoolLpToken;
  address public mockCurveGauge;

  // address public wethTokenAddress;

  constructor(
    address _vault,
    address _proposer,
    address _developer,
    address _keeper,
    address _pool,
    address _basePoolLpToken,
    address _metapool,
    address _metaPoolLpToken,
    uint128 _indexOfWantInPool,
    uint8 _noPoolCoins,
    address _metaPoolGauge,
    address _curveTokenAddress
  )
    CurveMeta(
      _vault,
      _proposer,
      _developer,
      _keeper,
      _pool,
      _basePoolLpToken,
      _metapool,
      _metaPoolLpToken,
      _indexOfWantInPool,
      _noPoolCoins,
      _metaPoolGauge
    )
  {
    setCurveTokenAddress(_curveTokenAddress);
  }

  function mockWithdrawSome(uint256 amount) external returns (uint256) {
    return _withdrawSome(amount);
  }

  function mockRemoveAllLiquidity() external {
    _removeLiquidity(super.estimatedTotalAssets());
  }

  function _approveBasic() internal override {}

  function setMockCurveGauge(address _mockCurveGauge) public {
    mockCurveGauge = _mockCurveGauge;
  }

  function setCurveMinter(address _minter) external {
    curveMinter = ICurveMinter(_minter);
  }

  function mockBalanceOfPool() external view returns (uint256) {
    return super._balanceOfPool();
  }

  function mockBalanceOfPoolInputToken() external view returns (uint256) {
    return super._balanceOfPoolInputToken();
  }

  function mockAddLiquidityToCurvePool() external {
    _addLiquidityToCurvePool();
  }

  // do nothing here in the mock as the addresses are not set up correctly yet
  function _approveOnInit() internal override {}

  function setDex(address _dex) external {
    dex = _dex;
  }

  function checkWantToken() internal view override {}

  function getCoinsCount() external view returns (uint256) {
    return super._getCoinsCount();
  }

  function getWantTokenIndex() external view returns (uint256) {
    super._getWantTokenIndex();
  }

  function depositLPTokens() external {
    super._depositLPTokens();
  }

  function setCurveTokenAddress(address _address) internal {
    curveTokenAddress = _address;
  }

  function _getCurveTokenAddress() internal view override returns (address) {
    return curveTokenAddress;
  }

  function _approveCurveExtra() internal override {}

  function approveCurveExtra() external {
    super._approveCurveExtra();
  }

  function approveOnInit() external {
    super._approveOnInit();
  }

  function swapToWant(address _from, uint256 _fromAmount) external returns (uint256) {
    return super._swapToWant(_from, _fromAmount);
  }

  function getQuoteForTokenToWant(address _from, uint256 _fromAmount) external view returns (uint256) {
    return super._getQuoteForTokenToWant(_from, _fromAmount);
  }
}
