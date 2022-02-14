// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../strategies/BaseStrategy.sol";

contract BaseStrategyMock is BaseStrategy {
  uint256 totalAssetValue;
  uint256 blockTimestamp;
  uint256 liquidatedAmount;
  uint256 liquidateLoss;
  uint256 prepareReturnProfit;
  uint256 prepareReturnLoss;
  uint256 prepareReturnDebtpayment;

  address[] reservedTokens;

  constructor(
    address _vault,
    address _proposer,
    address _developer,
    address _keeper
  ) BaseStrategy(_vault, _proposer, _developer, _keeper) {}

  function name() external view override returns (string memory) {
    return "MockStrategy";
  }

  function setTotalAssetValue(uint256 _total) external {
    totalAssetValue = _total;
  }

  function estimatedTotalAssets() public view override returns (uint256) {
    return totalAssetValue;
  }

  function setPrepareReturnResults(
    uint256 _profit,
    uint256 _loss,
    uint256 _debtPayment
  ) external {
    prepareReturnProfit = _profit;
    prepareReturnLoss = _loss;
    prepareReturnDebtpayment = _debtPayment;
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
    return (prepareReturnProfit, prepareReturnLoss, prepareReturnDebtpayment);
  }

  function adjustPosition(uint256 _debtOutstanding) internal override {}

  function setLiquidateResult(uint256 _liquidatedAmount, uint256 _loss) external {
    liquidatedAmount = _liquidatedAmount;
    liquidateLoss = _loss;
  }

  function liquidatePosition(uint256 _amountNeeded)
    internal
    override
    returns (uint256 _liquidatedAmount, uint256 _loss)
  {
    return (liquidatedAmount, liquidateLoss);
  }

  function setProtectedTokens(address[] calldata _tokens) external {
    for (uint256 i = 0; i < _tokens.length; i++) {
      reservedTokens.push(_tokens[i]);
    }
  }

  function protectedTokens() internal view override returns (address[] memory) {
    return reservedTokens;
  }

  function prepareMigration(address _newStrategy) internal override {}

  function setBlockTimestamp(uint256 _timestamp) external {
    blockTimestamp = _timestamp;
  }

  function timestamp() internal view override returns (uint256) {
    super.timestamp(); // improve code coverage
    return blockTimestamp;
  }

  function testOnlyStrategist() external view onlyStrategist {}

  function initialize(
    address _vault,
    address _proposer,
    address _developer,
    address _harvester
  ) external {
    _initialize(_vault, _proposer, _developer, _harvester);
  }
}
