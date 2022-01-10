// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../strategies/CurveEth.sol";

contract CurveEthStrategyMock is CurveEth {
  address public curveTokenAddress;
  address public wethTokenAddress;

  event ReturnsReported(uint256 profit, uint256 loss, uint256 debtPayment);
  event LiquidationReported(uint256 liquidatedAmount, uint256 loss);

  constructor(
    address _vault,
    address _strategist,
    address _rewards,
    address _keeper,
    address _pool
  ) CurveEth(_vault, _strategist, _rewards, _keeper, _pool) {}

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
  function initCurveGauge() external {
    curveGauge = ICurveGauge(_getCurvePoolGaugeAddress());
  }

  function setDex(address _dex) external {
    dex = _dex;
  }

  function setWETHTokenAddress(address _address) external {
    wethTokenAddress = _address;
    super.checkWantToken();
  }

  function setCurveTokenAddress(address _address) external {
    curveTokenAddress = _address;
  }

  function checkWantToken() internal view override {}

  function _getWETHTokenAddress() internal view override returns (address) {
    super._getWETHTokenAddress();
    return wethTokenAddress;
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
    (uint256 amount, uint256 loss) = super.liquidatePosition(_amount);
    emit LiquidationReported(amount, loss);
  }

  function testProtectedTokens() external view returns (address[] memory) {
    return super.protectedTokens();
  }

  function testOnHarvest() external {
    super.onHarvest();
  }
}
