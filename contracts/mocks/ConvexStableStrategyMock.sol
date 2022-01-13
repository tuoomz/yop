// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../strategies/ConvexStable.sol";
import "../mocks/CurveStableStrategyMock.sol";
import "hardhat/console.sol";

contract ConvexStableStrategyMock is ConvexStable {
  address public metapoolLpToken;
  address public curveTokenAddress;
  address public convexTokenAddress;
  IERC20 public _triPoolLpToken;

  constructor(
    address _vault,
    address _proposer,
    address _developer,
    address _keeper,
    address _pool,
    address _booster
  ) ConvexStable(_vault, _proposer, _developer, _keeper, _pool, _booster) {}

  function setDex(address _dex) external {
    dex = _dex;
  }

  function mockWithdrawSome(uint256 amount) external returns (uint256) {
    return _withdrawSome(amount);
  }

  function mockRemoveAllLiquidity() external {
    _removeLiquidity(super.estimatedTotalAssets());
  }

  function setMetaPoolLpToken(address _lpToken) external {
    metapoolLpToken = _lpToken;
  }

  function _getMetaPoolLpToken() internal view override returns (IERC20) {
    return IERC20(metapoolLpToken);
  }

  function setMetaPool(address _metaPool) external {
    usdnMetaPool = ICurveDeposit(_metaPool);
  }

  function _getMetaPool() internal view override returns (address) {
    return address(usdnMetaPool);
  }

  function mockProtectedTokens() external view returns (address[] memory) {
    return super.protectedTokens();
  }

  function setCurveTokenAddress(address _address) external {
    curveTokenAddress = _address;
  }

  function _getCurveTokenAddress() internal view override returns (address) {
    return curveTokenAddress;
  }

  function setConvexTokenAddress(address _address) external {
    convexTokenAddress = _address;
  }

  function _getConvexTokenAddress() internal view override returns (address) {
    return convexTokenAddress;
  }

  function setTriPoolLpToken(address _lpToken) external {
    _triPoolLpToken = IERC20(_lpToken);
  }

  function _getTriPoolLpToken() internal view override returns (IERC20) {
    return _triPoolLpToken;
  }

  function getConvexTokenAddress() public view returns (address) {
    return convexTokenAddress;
  }

  function mockClaimRewards() public {
    _claimRewards();
  }

  function mockDepositToConvex() public {
    _depositLPTokens();
  }

  function mockApproveDex() public {
    _approveDex();
  }

  function setCurvePool(address _pool) external {
    curvePool = ICurveDeposit(_pool);
  }

  function _approveCurveExtra() internal override {}

  function _approveOnInit() internal override {}
}
