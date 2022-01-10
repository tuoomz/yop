// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../strategies/ConvexBtc.sol";
import "hardhat/console.sol";

contract ConvexBtcStrategyMock is ConvexBtc {
  address public metapoolLpToken;
  address public curveTokenAddress;
  address public convexTokenAddress;
  address public wbtcTokenAddress;
  IERC20 public curvelpToken;

  constructor(
    address _vault,
    address _strategist,
    address _rewards,
    address _keeper,
    address _pool,
    address _booster
  ) ConvexBtc(_vault, _strategist, _rewards, _keeper, _pool, _booster) {}

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

  function _getMetaPoolLpToken() internal view returns (IERC20) {
    return IERC20(metapoolLpToken);
  }

  // function setMetaPool(address _metaPool) external {
  //   _meta = ICurveDeposit(_metaPool);
  // }

  // function _getMetaPool() internal view override returns (address) {
  //   return address(usdnMetaPool);
  // }

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

  function mockClaimRewards() public {
    _claimRewards();
  }

  function mockDepositToConvex() public {
    _depositLPTokens();
  }

  function testApproveDex() public {
    _approveDex();
  }

  function setCurvePool(address _pool) external {
    curvePool = ICurveDeposit(_pool);
  }

  function _getWTBCTokenAddress() internal view override returns (address) {
    return wbtcTokenAddress;
  }

  function setWBTCTokenAddress(address _address) external {
    wbtcTokenAddress = _address;
  }

  function _approveOnInit() internal override {}

  function _approveDexExtra() internal {}

  function setCurveAddressProvider(address _provider) external {
    curveAddressProvider = ICurveAddressProvider(_provider);
  }

  function getLpToken() external view returns (IERC20) {
    return curvelpToken;
  }

  function checkWantToken() internal view override {}

  function setLpToken(address _lpToken) external {
    curvelpToken = IERC20(_lpToken);
  }

  function mockOnHarvest() external {
    onHarvest();
  }
}
