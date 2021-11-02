// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "../BaseVault.sol";

/// @dev this is mainly used to test functions in the BaseVault
contract BaseVaultMock is BaseVault {
  constructor(
    string memory _name,
    string memory _symbol,
    uint8 _decimals,
    uint256 _managementFeeBPS,
    address _rewards,
    address _manager,
    address _gatekeeper
  ) BaseVault(_name, _symbol, _decimals, _managementFeeBPS, _rewards, _manager, _gatekeeper) {}
}
