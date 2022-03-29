// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../../../strategies/convexv2/ConvexERC20SinglePool.sol";
import "hardhat/console.sol";

contract ConvexERC20SinglePoolMock is ConvexERC20SinglePool {
  address public curveTokenAddress;
  address public convexTokenAddress;
  uint256 public coinsCount = 2;

  event ReturnsReported(uint256 profit, uint256 loss, uint256 debtPayment);
  event LiquidationReported(uint256 liquidatedAmount, uint256 loss);

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
    bool _isZapDepositor,
    uint256 _convexPoolId,
    address _convexBooster
  )
    ConvexERC20SinglePool(
      _vault,
      _proposer,
      _developer,
      _harvester,
      _pool,
      _gauge,
      _numberOfPoolTokens,
      _inputTokenIndex,
      _inputTokenAddress,
      _isZapDepositor,
      _convexPoolId,
      _convexBooster
    )
  {}

  function setCurve(address _curveMinter, address _curveToken) external {
    curveMinter = ICurveMinter(_curveMinter);
    curveTokenAddress = _curveToken;
    _approveTokens();
  }

  function _approveOnInit() internal override {}

  function _approveTokens() internal {
    super._approveOnInit();
  }

  function setDex(address _dex) external {
    dex = _dex;
  }

  function setConvexTokenAddress(address _address) external {
    convexTokenAddress = _address;
  }

  function _getConvexTokenAddress() internal view override returns (address) {
    return convexTokenAddress;
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

  function withdrawSome(uint256 _amount) external returns (uint256) {
    return super._withdrawSome(_amount);
  }

  function _getCoinsCount() internal view override returns (uint256) {
    super._getCoinsCount();
    return coinsCount;
  }

  function setCoinsCount(uint256 _coinsCount) external {
    coinsCount = _coinsCount;
  }
}
