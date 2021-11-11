// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../BaseVault.sol";

/// @dev this is mainly used to test functions in the BaseVault
contract BaseVaultMock is BaseVault {
  /* solhint-disable no-empty-blocks */
  constructor(
    string memory _name,
    string memory _symbol,
    address _governance,
    address _gatekeeper,
    address _rewards,
    address _strategyDataStoreAddress
  ) BaseVault(_name, _symbol, _governance, _gatekeeper, _rewards, _strategyDataStoreAddress) {}
  /* solhint-enable */
}
