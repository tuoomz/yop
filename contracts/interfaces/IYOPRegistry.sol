// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

interface IYOPRegistry {
  function currentVault(address _token) external view returns (address);
}
