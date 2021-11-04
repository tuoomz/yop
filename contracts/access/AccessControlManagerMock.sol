// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "./AccessControlManager.sol";

/// @notice This Mock will allow us test the access control mananger
contract AccessControlManagerMock is AccessControlManager {
  constructor(address[] memory _accessControlPolicies) AccessControlManager(_accessControlPolicies) {}

  /// @dev since solidity 0.7.0 'using ... for' is no longer inheirited, so we need to repeat it here
  using EnumerableSet for EnumerableSet.AddressSet;

  function addAccessControlPolicys(address[] calldata _policies) public {
    _addAccessControlPolicys(_policies);
  }

  function removeAccessControlPolicys(address[] calldata _policies) public {
    _removeAccessControlPolicys(_policies);
  }

  function getNumberOfAccessControlPolicies() public view returns (uint256) {
    return accessControlPolicies.length();
  }
}
