// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../vaults/SingleAssetVaultV2.sol";

contract SingleAssetVaultV2BoostedMock is SingleAssetVaultV2 {
  bool public useBoostedBalance;

  function setUseBoostedBalance(bool _useBoostedBalance) external {
    useBoostedBalance = _useBoostedBalance;
  }

  function setVaultRewardsContract(address _vaultRewardsContract) external {
    _updateVaultRewardsContract(_vaultRewardsContract);
  }

  function _afterTokenTransfer(
    address _from,
    address _to,
    uint256 _amount
  ) internal virtual override {
    if (useBoostedBalance) {
      super._afterTokenTransfer(_from, _to, _amount);
    }
  }
}
