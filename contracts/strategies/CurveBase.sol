// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "./BaseStrategy.sol";
import "../interfaces/curve/ICurveGauge.sol";
import "../interfaces/curve/ICurveMinter.sol";
import "../interfaces/curve/ICurveRegistry.sol";
import "../interfaces/curve/ICurveDeposit.sol";
import "../interfaces/curve/ICurveAddressProvider.sol";
import "../interfaces/sushiswap/IUniswapV2Router.sol";
import "hardhat/console.sol";

abstract contract CurveBase is BaseStrategy {
  using SafeERC20 for IERC20;
  using Address for address;

  // The address of the curve address provider. This address will never change is is the recommended way to get the address of their registry.
  // See https://curve.readthedocs.io/registry-address-provider.html#
  address private constant CURVE_ADDRESS_PROVIDER_ADDRESS = 0x0000000022D53366457F9d5E68Ec105046FC4383;
  // Minter contract address will never change either. See https://curve.readthedocs.io/dao-gauges.html#minter
  address private constant CURVE_MINTER_ADDRESS = 0xd061D61a4d941c39E5453435B6345Dc261C2fcE0;
  address private constant CRV_TOKEN_ADDRESS = 0xD533a949740bb3306d119CC777fa900bA034cd52;
  address private constant SUSHISWAP_ADDRESS = 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F;
  address private constant UNISWAP_ADDRESS = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
  address private constant WETH_ADDRESS = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  ICurveMinter public curveMinter;
  ICurveAddressProvider public curveAddressProvider;
  ICurveDeposit public curvePool;
  ICurveGauge public curveGauge;
  address public dex;

  constructor(
    address _vault,
    address _strategist,
    address _rewards,
    address _keeper,
    address _pool
  ) BaseStrategy(_vault, _strategist, _rewards, _keeper) {
    require(_pool != address(0), "invalid pool address");
    minReportDelay = 43_200; // 12hr
    maxReportDelay = 259_200; // 72hr
    profitFactor = 1000;
    debtThreshold = 1e24;
    dex = SUSHISWAP_ADDRESS;
    _initCurvePool(_pool);
    _approveOnInit();
  }

  function approveAll() external onlyAuthorized {
    _approveBasic();
    _approveDex();
  }

  function switchDex(bool isUniswap) external onlyAuthorized {
    if (isUniswap) {
      dex = UNISWAP_ADDRESS;
    } else {
      dex = SUSHISWAP_ADDRESS;
    }
    _approveDex();
  }

  /// @notice returns the total value of assets in want tokens
  /// @dev it should include the current balance of want tokens, the assets that are deployed and value of rewards so far
  function estimatedTotalAssets() public view virtual override returns (uint256) {
    return _balanceOfWant() + _balanceOfPool() + _balanceOfRewards();
  }

  function prepareMigration(address _newStrategy) internal override {
    // mint all the CRV tokens
    _claimRewards();
    _removeLiquidity(_getLpTokenBalance());
  }

  // solhint-disable-next-line no-unused-vars
  function adjustPosition(uint256 _debtOutstanding) internal virtual override {
    if (emergencyExit) {
      return;
    }
    _addLiquidityToCurvePool();
    _depositLPTokens();
  }

  function prepareReturn(uint256 _debtOutstanding)
    internal
    virtual
    override
    returns (
      uint256 _profit,
      uint256 _loss,
      uint256 _debtPayment
    )
  {
    uint256 wantBefore = _balanceOfWant();
    _claimRewards();
    uint256 wantNow = _balanceOfWant();
    _profit = wantNow - wantBefore;

    uint256 _total = estimatedTotalAssets();
    uint256 _debt = IVault(vault).strategy(address(this)).totalDebt;

    if (_total < _debt) {
      _loss = _debt - _total;
      _profit = 0;
    }

    if (_debtOutstanding > 0) {
      _withdrawSome(_debtOutstanding);
      _debtPayment = Math.min(_debtOutstanding, _balanceOfWant() - _profit);
    }
  }

  function liquidatePosition(uint256 _amountNeeded)
    internal
    virtual
    override
    returns (uint256 _liquidatedAmount, uint256 _loss)
  {
    // cash out all the rewards first
    _claimRewards();
    uint256 _balance = _balanceOfWant();
    if (_balance < _amountNeeded) {
      _liquidatedAmount = _withdrawSome(_amountNeeded - _balance);
      _liquidatedAmount = _liquidatedAmount + _balance;
      _loss = _amountNeeded - _liquidatedAmount; // this should be 0. o/w there must be an error
    } else {
      _liquidatedAmount = _amountNeeded;
    }
  }

  function protectedTokens() internal view virtual override returns (address[] memory) {
    address[] memory protected = new address[](2);
    protected[0] = _getCurveTokenAddress();
    protected[1] = curveGauge.lp_token();
    return protected;
  }

  function onHarvest() internal virtual override {
    // make sure the claimable rewards record is up to date
    curveGauge.user_checkpoint(address(this));
  }

  function _initCurvePool(address _pool) internal virtual {
    curveAddressProvider = ICurveAddressProvider(CURVE_ADDRESS_PROVIDER_ADDRESS);
    curveMinter = ICurveMinter(CURVE_MINTER_ADDRESS);
    curvePool = ICurveDeposit(_pool);
    curveGauge = ICurveGauge(_getCurvePoolGaugeAddress());
  }

  function _approveOnInit() internal virtual {
    _approveBasic();
    _approveDex();
  }

  function _balanceOfWant() internal view returns (uint256) {
    return want.balanceOf(address(this));
  }

  function _balanceOfPool() internal view virtual returns (uint256) {
    uint256 lpTokenAmount = _getLpTokenBalance();
    if (lpTokenAmount > 0) {
      uint256 outputAmount = curvePool.calc_withdraw_one_coin(lpTokenAmount, _int128(_getWantTokenIndex()));
      return outputAmount;
    }
    return 0;
  }

  function _balanceOfRewards() internal view virtual returns (uint256) {
    uint256 totalClaimableCRV = curveGauge.integrate_fraction(address(this));
    uint256 mintedCRV = curveMinter.minted(address(this), address(curveGauge));
    uint256 remainingCRV = totalClaimableCRV - mintedCRV;

    if (remainingCRV > 0) {
      return _getQuoteForTokenToWant(_getCurveTokenAddress(), remainingCRV);
    }
    return 0;
  }

  function _swapToWant(address _from, uint256 _fromAmount) internal virtual returns (uint256) {
    if (_fromAmount > 0) {
      address[] memory path;
      if (address(want) == _getWETHTokenAddress()) {
        path = new address[](2);
        path[0] = _from;
        path[1] = address(want);
      } else {
        path = new address[](3);
        path[0] = _from;
        path[1] = address(_getWETHTokenAddress());
        path[2] = address(want);
      }
      /* solhint-disable  not-rely-on-time */
      uint256[] memory amountOut = IUniswapV2Router(dex).swapExactTokensForTokens(
        _fromAmount,
        uint256(0),
        path,
        address(this),
        block.timestamp
      );
      /* solhint-enable */
      return amountOut[path.length - 1];
    }
    return 0;
  }

  function _depositLPTokens() internal virtual {
    address poolLPToken = curveGauge.lp_token();
    uint256 balance = IERC20(poolLPToken).balanceOf(address(this));
    if (balance > 0) {
      curveGauge.deposit(balance);
    }
  }

  function _withdrawSome(uint256 _amount) internal virtual returns (uint256) {
    uint256 requiredLPTokenAmount;
    // check how many LP tokens we will need for the given want _amount
    // not great, but can't find a better way to define the params dynamically based on the coins count
    if (_getCoinsCount() == 2) {
      uint256[2] memory params;
      params[_getWantTokenIndex()] = _amount;
      requiredLPTokenAmount = (curvePool.calc_token_amount(params, true) * 10200) / 10000; // adding 2% padding
    } else if (_getCoinsCount() == 3) {
      uint256[3] memory params;
      params[_getWantTokenIndex()] = _amount;
      requiredLPTokenAmount = (curvePool.calc_token_amount(params, true) * 10200) / 10000; // adding 2% padding
    } else if (_getCoinsCount() == 4) {
      uint256[4] memory params;
      params[_getWantTokenIndex()] = _amount;
      requiredLPTokenAmount = (curvePool.calc_token_amount(params, true) * 10200) / 10000; // adding 2% padding
    }
    // decide how many LP tokens we can actually withdraw
    return _removeLiquidity(requiredLPTokenAmount);
  }

  /// @dev Remove the liquidity by the LP token amount
  /// @param _amount The amount of LP token (not want token)
  function _removeLiquidity(uint256 _amount) internal virtual returns (uint256) {
    uint256 balance = _getLpTokenBalance();
    uint256 withdrawAmount = Math.min(_amount, balance);
    // withdraw this amount of token from the gauge first
    _removeLpToken(withdrawAmount);
    // then remove the liqudity from the pool, will get eth back
    uint256 amount = curvePool.remove_liquidity_one_coin(withdrawAmount, _int128(_getWantTokenIndex()), 0);
    return amount;
  }

  function _getLpTokenBalance() internal view virtual returns (uint256) {
    return curveGauge.balanceOf(address(this));
  }

  function _removeLpToken(uint256 _amount) internal virtual {
    curveGauge.withdraw(_amount);
  }

  function _claimRewards() internal virtual {
    curveMinter.mint(address(curveGauge));
    uint256 crvBalance = IERC20(_getCurveTokenAddress()).balanceOf(address(this));
    _swapToWant(_getCurveTokenAddress(), crvBalance);
  }

  function _getPoolLPTokenAddress(address _pool) internal virtual returns (address) {
    require(_pool != address(0), "invalid pool address");
    address registry = curveAddressProvider.get_registry();
    return ICurveRegistry(registry).get_lp_token(address(_pool));
  }

  function _getCurvePoolGaugeAddress() internal view virtual returns (address) {
    address registry = curveAddressProvider.get_registry();
    (address[10] memory gauges, ) = ICurveRegistry(registry).get_gauges(address(curvePool));
    // This only usese the first gauge of the pool. Should be enough for most cases, however, if this is not the case, then this method should be overriden

    return gauges[0];
  }

  function _getCurveTokenAddress() internal view virtual returns (address) {
    return CRV_TOKEN_ADDRESS;
  }

  function _getWETHTokenAddress() internal view virtual returns (address) {
    return WETH_ADDRESS;
  }

  function _getQuoteForTokenToWant(address _from, uint256 _fromAmount) internal view virtual returns (uint256) {
    if (_fromAmount > 0) {
      address[] memory path;
      if (address(want) == _getWETHTokenAddress()) {
        path = new address[](2);
        path[0] = _from;
        path[1] = address(want);
      } else {
        path = new address[](3);
        path[0] = _from;
        path[1] = address(_getWETHTokenAddress());
        path[2] = address(want);
      }
      uint256[] memory amountOut = IUniswapV2Router(dex).getAmountsOut(_fromAmount, path);
      return amountOut[path.length - 1];
    }
    return 0;
  }

  function _approveBasic() internal virtual {
    IERC20(curveGauge.lp_token()).safeApprove(address(curveGauge), type(uint256).max);
  }

  function _approveDex() internal virtual {
    IERC20(_getCurveTokenAddress()).safeApprove(dex, type(uint256).max);
  }

  // does not deal with over/under flow
  function _int128(uint256 _val) internal pure returns (int128) {
    return int128(uint128(_val));
  }

  function _addLiquidityToCurvePool() internal virtual;

  function _getWantTokenIndex() internal view virtual returns (uint256);

  function _getCoinsCount() internal view virtual returns (uint256);
}
