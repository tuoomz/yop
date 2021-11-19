// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../vaults/SingleAssetVault.sol";

contract SingleAssetVaultV2Mock is SingleAssetVault {
  function version() external pure virtual override returns (string memory) {
    return "2.0.0";
  }
}
