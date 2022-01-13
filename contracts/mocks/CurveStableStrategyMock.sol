// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../strategies/CurveStable.sol";
import "hardhat/console.sol";

contract CurveStableStrategyMock is CurveStable {
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
    address _pool
  ) CurveStable(_vault, _proposer, _developer, _keeper, _pool) {}

  // do nothing here in the mock as it doesn't have the addresses of mocked contract yet
  function _initCurvePool(address _pool) internal override {}

  function mockWithdrawSome(uint256 amount) external returns (uint256) {
    return _withdrawSome(amount);
  }

  function mockRemoveAllLiquidity() external {
    _removeLiquidity(super.estimatedTotalAssets());
  }

  function _approveCurveExtra() internal override {}

  function _approveBasic() internal override {}

  function setMockCurveGauge(address _mockCurveGauge) public {
    mockCurveGauge = _mockCurveGauge;
  }

  function _getCurvePoolGaugeAddress() internal view virtual override returns (address) {
    return mockCurveGauge;
  }

  function mockGetMetaPool() external view returns (address) {
    return super._getMetaPool();
  }

  function mockGetTriPoolLpToken() external view returns (IERC20) {
    return super._getTriPoolLpToken();
  }

  function mockGetMetaPoolLpToken() external view returns (IERC20) {
    return super._getMetaPoolLpToken();
  }

  function mockBalanceOfPool() external view returns (uint256) {
    return _balanceOfPool();
  }

  function mockGetWantIndexInCurvePool(address _pool) external view returns (int128) {
    return _getWantIndexInCurvePool(_pool);
  }

  function mockAddLiquidityToCurvePool() external {
    _addLiquidityToCurvePool();
  }

  // do nothing here in the mock as the addresses are not set up correctly yet
  function _approveOnInit() internal override {}

  function setCurveAddressProvider(address _provider) external {
    curveAddressProvider = ICurveAddressProvider(_provider);
  }

  function setTriPoolLpToken(address _lpToken) external {
    _triPoolLpToken = IERC20(_lpToken);
  }

  function _getTriPoolLpToken() internal view override returns (IERC20) {
    return _triPoolLpToken;
  }

  function setMetaPoolLpToken(address _lpToken) external {
    metapoolLpToken = _lpToken;
  }

  function _getMetaPoolLpToken() internal view override returns (IERC20) {
    return IERC20(metapoolLpToken);
  }

  function setCurveMinter(address _minter) external {
    curveMinter = ICurveMinter(_minter);
  }

  function setCurvePool(address _pool) external {
    curvePool = ICurveDeposit(_pool);
  }

  // init the curve gauge, the gauge address will be retrieved from the registry, which will be returned by the address provider
  function initCurveGauge() external {
    curveGauge = ICurveGauge(_getCurvePoolGaugeAddress());
  }

  function setDex(address _dex) external {
    dex = _dex;
  }

  function setMetaPool(address _metaPool) external {
    usdnMetaPool = ICurveDeposit(_metaPool);
  }

  function _getMetaPool() internal view override returns (address) {
    return address(usdnMetaPool);
  }

  function setCurveTokenAddress(address _address) external {
    curveTokenAddress = _address;
  }

  function checkWantToken() internal view override {}

  function _getCurveTokenAddress() internal view override returns (address) {
    return curveTokenAddress;
  }
}
