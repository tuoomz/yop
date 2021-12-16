// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../interfaces/curve/ICurveDeposit.sol";
import "../interfaces/curve/ICurveGauge.sol";
import "../interfaces/curve/ICurveMinter.sol";
import "../interfaces/sushiswap/IUniswapV2Router.sol";
import "./CurveStableBase.sol";
import "hardhat/console.sol";

contract CurveStable is CurveStableBase {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using Address for address;

  constructor(address _vault) CurveStableBase(_vault) {
    // TODO: curve addresses should be passed in in constructor arguments

    threePool = 0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7;
    usdnMetaPool = 0x0f9cb53Ebe405d49A0bbdBD291A65Ff571bC83e1;
    curveGuage = address(0xF98450B5602fa59CC66e1379DFfB6FDDc724CfC4);
    curveMinter = address(0xd061D61a4d941c39E5453435B6345Dc261C2fcE0);

    dex = SUSHISWAP;
    wantCurveDepositIndex = _getWantIndexInCurvePool();
    _approveBasic();
    _approveDex();
  }

  function prepareReturn(uint256 _debtOutstanding)
    internal
    override
    returns (
      uint256 _profit,
      uint256 _loss,
      uint256 _debtPayment
    )
  {
    console.log("prepareReturn()");
    uint256 wantBefore = balanceOfWant();
    ICurveMinter(curveMinter).mint(curveGuage);
    uint256 crvBalance = CRV.balanceOf(address(this));
    // console.log("    wantBefore %s", wantBefore);
    // console.log("    crvBalance %s", crvBalance);

    if (crvBalance > 0) {
      address[] memory path = new address[](2);
      path[0] = address(CRV);
      path[1] = address(want);
      IUniswapV2Router(dex).swapExactTokensForTokens(crvBalance, uint256(0), path, address(this), block.timestamp);
    }

    uint256 _total = estimatedTotalAssetsNow();
    uint256 _debt = IVault(vault).strategy(address(this)).totalDebt;
    // console.log("  total %s", _total);
    // console.log("  debt %s", _debt);

    if (_total < _debt) {
      _loss = _debt.sub(_total);
      _profit = 0;
    }

    console.log("  _debtOutstanding %s", _debt);
    if (_debtOutstanding > 0) {
      _withdrawSome(_debtOutstanding);
      _debtPayment = Math.min(_debtOutstanding, balanceOfWant().sub(_profit));
    }
    console.log("  _profit %s", _profit);
    console.log("  _loss %s", _loss);
    console.log("  _debtPayment %s", _debtPayment);
  }

  function protectedTokens() internal pure override returns (address[] memory) {
    address[] memory protected = new address[](1);
    protected[0] = address(CRV);
    return protected;
  }
}
