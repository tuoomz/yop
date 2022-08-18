// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../strategies/convexv2/ConvexCurveMeta.sol";

contract ConvexCurveMetaMock is ConvexCurveMeta {
  address public curveTokenAddress;
  address public convexTokenAddress;
  uint256 public coinsCount = 3;

  event ReturnsReported(uint256 profit, uint256 loss, uint256 debtPayment);
  event LiquidationReported(uint256 liquidatedAmount, uint256 loss);

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
    address _convexBooster,
    uint256 _poolId
  )
    ConvexCurveMeta(
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
      _convexBooster,
      _poolId
    )
  {
    _approveTokens();
  }

  function _approveOnInit() internal override {}

  function _approveTokens() internal {
    super._approveOnInit();
  }

  function setDex(address _dex) external {
    dex = _dex;
  }

  function testApproveDex() public {
    super._approveDex();
  }

  function _getCurveTokenAddress() internal view override returns (address) {
    super._getCurveTokenAddress();
    return curveTokenAddress;
  }

  function _getConvexTokenAddress() internal view override returns (address) {
    super._getConvexTokenAddress();
    return convexTokenAddress;
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

  function setCurveTokenAddress(address _curveTokenAddress) external {
    curveTokenAddress = _curveTokenAddress;
  }

  function setConvexTokenAddress(address _convexTokenAddress) external {
    convexTokenAddress = _convexTokenAddress;
  }

  function _approveDex() internal override {}

  function mockOnHarvest() external {
    onHarvest();
  }
}
