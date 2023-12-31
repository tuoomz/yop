// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

contract HealthCheckMock {
  bool internal doCheck;

  bool internal checkResult = true;

  function setDoCheck(bool _check) external {
    doCheck = _check;
  }

  function setCheckResult(bool _result) external {
    checkResult = _result;
  }

  /* solhint-disable */
  function check(
    address callerStrategy,
    uint256 profit,
    uint256 loss,
    uint256 debtPayment,
    uint256 debtOutstanding,
    uint256 totalDebt
  ) external view returns (bool) {
    return checkResult;
  }

  /* solhint-enable */

  // solhint-disable-next-line
  function doHealthCheck(address _strategy) external view returns (bool) {
    return doCheck;
  }

  // solhint-disable-next-line
  function enableCheck(address _strategy) external {}
}
