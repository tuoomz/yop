// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../vaults/SingleAssetVault.sol";

contract SingleAssetVaultV2Mock is SingleAssetVault {
  function version() external pure virtual override returns (string memory) {
    return "2.0.0";
  }

  function authorizeUpgrade(address _to) external view {
    super._authorizeUpgrade(_to);
  }

  function testIssueSharesForAmount(address _recipient, uint256 _amount) external {
    super._issueSharesForAmount(_recipient, _amount);
  }
}
