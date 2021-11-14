// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

contract MockHealthCheck {
  bool internal doCheck;

  function setDoCheck(bool _check) external {
    doCheck = _check;
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
    return true;
  }

  /* solhint-enable */

  // solhint-disable-next-line
  function doHealthCheck(address _strategy) external view returns (bool) {
    return doCheck;
  }

  // solhint-disable-next-line
  function enableCheck(address _strategy) external {}
}
