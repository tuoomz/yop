// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../strategies/ConvexEth.sol";
import "hardhat/console.sol";

contract ConvexEthStrategyMock is ConvexEth {
  address public metapoolLpToken;
  address public curveTokenAddress;
  address public convexTokenAddress;
  address public ethTokenAddress;
  IERC20 public curvelpToken;

  constructor(
    address _vault,
    address _strategist,
    address _rewards,
    address _keeper,
    address _pool,
    address _booster
  ) ConvexEth(_vault, _strategist, _rewards, _keeper, _pool, _booster) {}

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

  function _getWETHTokenAddress() internal view override returns (address) {
    return ethTokenAddress;
  }

  function setWETHTokenAddress(address _weth) external {
    ethTokenAddress = _weth;
  }

  function _getConvexTokenAddress() internal view override returns (address) {
    return convexTokenAddress;
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

  function testApproveDex() public {
    _approveDex();
  }

  function setCurvePool(address _pool) external {
    curvePool = ICurveDeposit(_pool);
  }

  function _approveOnInit() internal override {}

  function _initCurvePool(address _pool) internal override {}

  function setCurveAddressProvider(address _provider) external {
    curveAddressProvider = ICurveAddressProvider(_provider);
  }

  function getLpToken() public view returns (IERC20) {
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
