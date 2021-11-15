// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../SingleAssetVaultBase.sol";

contract SingleAssetVaultBaseMock is SingleAssetVaultBase {
  /* solhint-disable no-empty-blocks */
  constructor(
    string memory _name,
    string memory _symbol,
    address _governance,
    address _gatekeeper,
    address _rewards,
    address _strategyDataStoreAddress,
    address _token
  ) SingleAssetVaultBase(_name, _symbol, _governance, _gatekeeper, _rewards, _strategyDataStoreAddress, _token) {}

  /* solhint-enable */
}
