// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "./BaseStrategy.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../interfaces/curve/ICurveDeposit.sol";
import "../interfaces/curve/ICurveGauge.sol";
import "../interfaces/curve/ICurveMinter.sol";
import "../interfaces/sushiswap/IUniswapV2Router.sol";
import "hardhat/console.sol";

abstract contract CurveStableBase is BaseStrategy {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using Address for address;

  // Curve.fi: DAI/USDC/USDT Pool
  address internal threePool;
  address internal usdnMetaPool;

  IERC20 internal constant CRV = IERC20(0xD533a949740bb3306d119CC777fa900bA034cd52);
  IERC20 internal constant THREE_CRV = IERC20(0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490);
  IERC20 internal constant USDN_3CRV = IERC20(0x4f3E8F405CF5aFC05D68142F3783bDfE13811522);

  IERC20 internal constant WETH = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

  address internal constant SUSHISWAP = address(0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F);
  address internal constant SUSHI_WETH_CRV = address(0x58Dc5a51fE44589BEb22E8CE67720B5BC5378009);

  uint256 internal constant DENOMINATOR = 10000;

  // curve
  // address internal curveDeposit;
  address internal curveGuage;
  address internal curveMinter;
  uint8 public wantCurveDepositIndex;

  address public dex;

  address[] internal CRV_WETH_PATH = new address[](2);
  address[] internal WETH_WANT_PATH = new address[](2);

  //TODO: need to make sure the right amount of parameters are set
  constructor(address _vault) BaseStrategy(_vault, msg.sender, msg.sender, msg.sender) {
    CRV_WETH_PATH[0] = address(CRV);
    CRV_WETH_PATH[1] = address(WETH);
    WETH_WANT_PATH[0] = address(WETH);
    WETH_WANT_PATH[1] = address(want);
    minReportDelay = 43_200; // 12hr
    maxReportDelay = 259_200; // 72hr
    profitFactor = 1000;
    debtThreshold = 1e24;
    // keepCRV = 0;
  }

  // TODO: strategy spend ceiling

  function _isWant(address candidate) internal view returns (bool) {
    return address(want) == candidate;
  }

  function _getWantIndexInCurvePool() internal view returns (uint8) {
    // only three coins
    address _candidate;
    for (uint8 i = 0; i < 3; i++) {
      _candidate = ICurveDeposit(threePool).coins(uint8(i));
      if (_isWant(_candidate)) {
        return uint8(i);
      }
    }
  }

  function _approveBasic() internal {
    IERC20(want).safeApprove(threePool, type(uint256).max);
    USDN_3CRV.safeApprove(curveGuage, type(uint256).max);
    THREE_CRV.safeApprove(usdnMetaPool, type(uint256).max);
  }

  function _approveDex() internal virtual {
    CRV.safeApprove(dex, type(uint256).max);
  }

  function approveAll() external onlyAuthorized {
    _approveBasic();
    _approveDex();
  }

  function name() external view override returns (string memory) {
    return string(abi.encodePacked("Curve", IERC20Metadata(address(want)).symbol()));
  }

  function balanceOfWant() public view returns (uint256) {
    uint256 _want = want.balanceOf(address(this));
    return _want;
  }

  function getCrvInWant(uint256 crvAmount) internal view returns (uint256) {
    uint256[] memory crvInWeth = IUniswapV2Router(SUSHISWAP).getAmountsOut(crvAmount, CRV_WETH_PATH);
    uint256[] memory _wantAmount = IUniswapV2Router(SUSHISWAP).getAmountsOut(crvInWeth[1], WETH_WANT_PATH);
    return _wantAmount[1];
  }

  function balanceOfPoolInWantNow() public returns (uint256) {
    uint256 claimableCrv = ICurveGauge(curveGuage).claimable_tokens(address(this));
    if (claimableCrv == 0) {
      return uint8(0);
    }

    return getCrvInWant(claimableCrv);
  }

  function balanceOfPoolInWantLastHarvest() public view returns (uint256) {
    uint256 claimableCrv = ICurveGauge(curveGuage).integrate_fraction(address(this));
    uint256 minted = ICurveMinter(curveMinter).minted(address(this), curveGuage);
    uint256 claimableTokens = claimableCrv.sub(minted);
    console.log("balanceOfPoolInWantLastHarvest() integrate_fraction %s", claimableCrv);
    console.log("balanceOfPoolInWantLastHarvest() minted %s", minted);
    console.log("balanceOfPoolInWantLastHarvest() claimable_tokens %s", claimableTokens);

    if (claimableTokens == 0) {
      return uint8(0);
    }
    return getCrvInWant(claimableCrv);
  }

  function estimatedTotalAssetsNow() internal returns (uint256) {
    return balanceOfWant().add(balanceOfPoolInWantNow());
  }

  function estimatedTotalAssets() public view override returns (uint256) {
    return balanceOfWant().add(balanceOfPoolInWantLastHarvest());
  }

  function _buildDepositArray(uint256 _amount) public view returns (uint256[3] memory) {
    uint256[3] memory _tokenBins;
    _tokenBins[wantCurveDepositIndex] = _amount;
    return _tokenBins;
  }

  function adjustPosition(uint256 _debtOutstanding) internal override {
    console.log("adjustPosition() _debtOutstanding %s", _debtOutstanding);

    if (emergencyExit) return;

    uint256 _want = want.balanceOf(address(this));
    console.log("  _want %s", _want);

    if (_want > 0) {
      uint256[3] memory _tokens = _buildDepositArray(balanceOfWant());

      console.log("  threePool.add_liquidity() %s %s %s", _tokens[0], _tokens[1], _tokens[2]);
      // add 'want' on correct index and receive 3pool lp tokens - THREE_CRV
      ICurveDeposit(threePool).add_liquidity(_tokens, 1);
      console.log("  usdnMetaPool.add_liquidity() _3crv: %s", THREE_CRV.balanceOf(address(this)));

      // stake 3crv and recevice usdnMetaPool LP tokens - USDN_3CRV
      ICurveDeposit(usdnMetaPool).add_liquidity([0, THREE_CRV.balanceOf(address(this))], uint256(0));
    }

    uint256 _usdn3crvLPs = USDN_3CRV.balanceOf(address(this));
    console.log("  _usdn3crvLPs %s %s", _usdn3crvLPs);

    if (_usdn3crvLPs > 0) {
      // add usdn3crvLp tokens to curveguage, this allow to call mint to receive CRV tokens
      ICurveGauge(curveGuage).deposit(_usdn3crvLPs);
      uint256 balance = ICurveGauge(curveGuage).balanceOf(address(this));
      console.log("guage balance %s", balance);
    }
  }

  // @amount: amount of want wanted
  function getWantInCrv(uint256 _amount) public view returns (uint256) {
    uint16 _feeBasisPoint = 10200; //102%

    address[] memory wantWethPath = new address[](2);
    wantWethPath[0] = address(want);
    wantWethPath[1] = address(WETH);

    uint256[] memory wantInWeth = IUniswapV2Router(SUSHISWAP).getAmountsOut(_amount, wantWethPath);

    address[] memory path = new address[](2);
    path[0] = address(WETH);
    path[1] = address(CRV);

    uint256[] memory lpInWant = IUniswapV2Router(SUSHISWAP).getAmountsOut(wantInWeth[1], path);
    return lpInWant[1].mul(_feeBasisPoint).div(10000);
  }

  function getWantInLp(uint256 _amountOfBase) public view returns (uint256) {
    uint16 _feeBasisPoint = 10200; //102%
    int128 wantIndex = int128(uint128(wantCurveDepositIndex));
    uint256 _wantIn3crv = ICurveDeposit(threePool).calc_withdraw_one_coin(_amountOfBase, wantIndex);
    uint256 _3crvInUsdn3crv = ICurveDeposit(usdnMetaPool).calc_withdraw_one_coin(_wantIn3crv, 1);

    // add 2%
    return _3crvInUsdn3crv.mul(_feeBasisPoint).div(10000);
  }

  /// @dev release fund to vault
  /// @param _amount - amount of 'want' tokens to withdraw
  function _withdrawSome(uint256 _amount) internal returns (uint256) {
    console.log("_withdrawSome() %s", _amount);
    uint256 _before = balanceOfWant();
    console.log("_before want %s", _before);

    // retrieve LP tokens

    console.log("curveGuage balance before: %s", ICurveGauge(curveGuage).balanceOf(address(this)));

    uint256 curveBalance = ICurveGauge(curveGuage).balanceOf(address(this));
    uint256 _usdn3CrvLp = getWantInLp(_amount);
    console.log("curveGuage withsdraw: %s", Math.min(curveBalance, _usdn3CrvLp));
    ICurveGauge(curveGuage).withdraw(Math.min(curveBalance, _usdn3CrvLp));
    console.log("curveGuage balance after: %s", ICurveGauge(curveGuage).balanceOf(address(this)));

    uint256 usdn3crv = USDN_3CRV.balanceOf(address(this));
    console.log("_usdn3CrvLp balance before: %s", USDN_3CRV.balanceOf(address(this)));
    ICurveDeposit(usdnMetaPool).remove_liquidity_one_coin(usdn3crv, 1, uint256(0));
    console.log("_usdn3CrvLp balance after: %s", USDN_3CRV.balanceOf(address(this)));

    uint256 _3crv = THREE_CRV.balanceOf(address(this));
    console.log("3crv balance: %s", THREE_CRV.balanceOf(address(this)));
    int128 wantIndex = int128(uint128(wantCurveDepositIndex));
    ICurveDeposit(threePool).remove_liquidity_one_coin(_3crv, wantIndex, 0);
    console.log("balance of want %s", balanceOfWant());
    console.log("balance of _before %s", _before);
    console.log("balance of USDN_3CRV %s", USDN_3CRV.balanceOf(address(this)));
    console.log("balance of THREE_CRV %s", THREE_CRV.balanceOf(address(this)));
    return balanceOfWant().sub(_before);
  }

  function liquidatePosition(uint256 _amountNeeded)
    internal
    override
    returns (uint256 _liquidatedAmount, uint256 _loss)
  {
    uint256 _balance = balanceOfWant();
    if (_balance < _amountNeeded) {
      _liquidatedAmount = _withdrawSome(_amountNeeded.sub(_balance));
      _liquidatedAmount = _liquidatedAmount.add(_balance);

      // its possible that we withdraw more than needed - for fees and slippage,
      // this can cause underflow
      bool underflow;
      uint256 _withdrawBalance;
      (underflow, _withdrawBalance) = _amountNeeded.trySub(_liquidatedAmount);
      if (underflow == true) {
        _loss = 0;
      } else {
        _loss = _withdrawBalance;
      }
    } else {
      _liquidatedAmount = _amountNeeded;
    }
  }

  function prepareMigration(address _newStrategy) internal override {
    ICurveMinter(curveMinter).mint(curveGuage);
    _migrateRewards(_newStrategy);
  }

  function _migrateRewards(address _newStrategy) internal virtual {
    CRV.safeTransfer(_newStrategy, CRV.balanceOf(address(this)));
  }
}
