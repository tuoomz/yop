// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../interfaces/ICustomHealthCheck.sol";

contract CustomHealthCheckMock is ICustomHealthCheck {
  bool internal result;

  function setResult(bool _result) external {
    result = _result;
  }

  /* solhint-disable */

  function check(
    address callerStrategy,
    uint256 profit,
    uint256 loss,
    uint256 debtPayment,
    uint256 debtOutstanding
  ) external view returns (bool) {
    return result;
  }
  /* solhint-enable */
}
