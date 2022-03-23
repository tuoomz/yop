// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

interface IStaking {
  function totalWorkingSupply() external view returns (uint256);

  function workingBalanceOf(address _user) external view returns (uint256);
}
