// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

interface ICustomHealthCheck {
  function check(
    address callerStrategy,
    uint256 profit,
    uint256 loss,
    uint256 debtPayment,
    uint256 debtOutstanding
  ) external view returns (bool);
}
