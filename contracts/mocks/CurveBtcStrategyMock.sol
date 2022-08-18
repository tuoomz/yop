// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../strategies/CurveBtc.sol";

contract CurveBtcStrategyMock is CurveBtc {
  address public curveTokenAddress;
  address public wbtcTokenAddress;

  event ReturnsReported(uint256 profit, uint256 loss, uint256 debtPayment);
  event LiquidationReported(uint256 liquidatedAmount, uint256 loss);

  constructor(
    address _vault,
    address _proposer,
    address _developer,
    address _keeper,
    address _pool
  ) CurveBtc(_vault, _proposer, _developer, _keeper, _pool) {}

  // do nothing here in the mock as it doesn't have the addresses of mocked contract yet
  function _initCurvePool(address _pool) internal override {}

  // do nothing here in the mock as the addresses are not set up correctly yet
  function _approveOnInit() internal override {}

  function setCurveAddressProvider(address _provider) external {
    curveAddressProvider = ICurveAddressProvider(_provider);
  }

  function setCurveMinter(address _minter) external {
    curveMinter = ICurveMinter(_minter);
  }

  function setCurvePool(address _pool) external {
    curvePool = ICurveDeposit(_pool);
  }

  // init the curve gauge, the gauge address will be retrieved from the registry, which will be returned by the address provider
  function initCurveGauge(address _gauge) external {
    curveGauge = ICurveGauge(_gauge);
  }

  function setDex(address _dex) external {
    dex = _dex;
  }

  function testApproveDex() external {
    _approveDex();
  }

  function setBTCTokenAddress(address _address) external {
    wbtcTokenAddress = _address;
    super.checkWantToken();
  }

  function setCurveTokenAddress(address _address) external {
    curveTokenAddress = _address;
  }

  function checkWantToken() internal view override {}

  function _getWTBCTokenAddress() internal view override returns (address) {
    super._getWTBCTokenAddress();
    return wbtcTokenAddress;
  }

  function _getCurveTokenAddress() internal view override returns (address) {
    super._getCurveTokenAddress();
    return curveTokenAddress;
  }

  function testPrepareReturn(uint256 _debtOutstanding) external {
    (uint256 _profit, uint256 _loss, uint256 _debtPayment) = super.prepareReturn(_debtOutstanding);
    emit ReturnsReported(_profit, _loss, _debtPayment);
  }

  function testPrepareMigration(address _newStrategy) external {
    super.prepareMigration(_newStrategy);
  }

  function testLiquidatePosition(uint256 _amount) external {
    (uint256 amount, uint256 loss) = super.liquidatePosition(_amount, true);
    emit LiquidationReported(amount, loss);
  }

  function testProtectedTokens() external view returns (address[] memory) {
    return super.protectedTokens();
  }
}
