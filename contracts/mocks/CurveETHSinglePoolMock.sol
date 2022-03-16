// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../strategies/curvev2/CurveETHSinglePool.sol";

contract CurveETHSinglePoolMock is CurveETHSinglePool {
  address public curveTokenAddress;
  address public wethTokenAddress;

  event ReturnsReported(uint256 profit, uint256 loss, uint256 debtPayment);
  event LiquidationReported(uint256 liquidatedAmount, uint256 loss);

  constructor(
    address _vault,
    address _proposer,
    address _developer,
    address _harvester,
    address _pool,
    address _gauge,
    uint8 _inputTokenIndex,
    address _curveMinter,
    address _curveToken,
    address _wethAddress
  ) CurveETHSinglePool(_vault, _proposer, _developer, _harvester, _pool, _gauge, _inputTokenIndex) {
    curveMinter = ICurveMinter(_curveMinter);
    curveTokenAddress = _curveToken;
    wethTokenAddress = _wethAddress;
    _approveTokens();
  }

  function _approveOnInit() internal override {}

  function _approveCurveExtra() internal override {}

  function _approveTokens() internal {
    super._approveOnInit();
    super._approveCurveExtra();
  }

  function setDex(address _dex) external {
    dex = _dex;
  }

  function checkWantToken() internal view override {}

  function setWETHTokenAddress(address _address) external {
    wethTokenAddress = _address;
    super.checkWantToken();
  }

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

  function balanceOfPool() external view returns (uint256) {
    return super._balanceOfPool();
  }

  function withdrawSome(uint256 _amount) external returns (uint256) {
    return super._withdrawSome(_amount);
  }
}
