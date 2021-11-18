// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./AllowListAccessControl.sol";
import "../vaults/roles/Governable.sol";

// this interface will allow us to implement different types of access policies for Vaults.
// e.g. allowedList/blockedlist based, NFT based etc. Then a vault can reuse these to control access to them.

abstract contract AbstractAccessControlManager {
  /// @notice access policies set on the vault

  event AccessControlPolicyAdded(address _policy);
  event AccessControlPolicyRemoved(address _policy);
}

// This implementation will allow us to set an allowed list of user addresses
abstract contract AccessControlManager is AbstractAccessControlManager {
  // Add the library methods
  using EnumerableSet for EnumerableSet.AddressSet;

  EnumerableSet.AddressSet internal accessControlPolicies;

  // solhint-disable-next-line no-empty-blocks
  constructor() {}

  // solhint-disable-next-line func-name-mixedcase
  function __AccessControlManager_init(address[] memory _accessControlPolicies) internal {
    __AccessControlManager_init_unchained(_accessControlPolicies);
  }

  // solhint-disable-next-line func-name-mixedcase
  function __AccessControlManager_init_unchained(address[] memory _accessControlPolicies) internal {
    _addAccessControlPolicys(_accessControlPolicies);
  }

  // Had to use memory here instead of calldata as the function is
  // used in the constructor
  function _addAccessControlPolicys(address[] memory _policies) internal {
    for (uint256 i = 0; i < _policies.length; i++) {
      if (_policies[i] != address(0)) {
        bool added = accessControlPolicies.add(_policies[i]);
        if (added) {
          emit AccessControlPolicyAdded(_policies[i]);
        }
      }
    }
  }

  function _removeAccessControlPolicys(address[] calldata _policies) internal {
    for (uint256 i = 0; i < _policies.length; i++) {
      if (_policies[i] != address(0)) {
        bool removed = accessControlPolicies.remove(_policies[i]);
        if (removed) {
          emit AccessControlPolicyRemoved(_policies[i]);
        }
      }
    }
  }

  function hasAccess(address _user, address _vault) external view returns (bool) {
    return _hasAccess(_user, _vault);
  }

  function _hasAccess(address _user, address _vault) internal view returns (bool) {
    require(_vault != address(0), "invalid vault address");
    require(_user != address(0), "invalid user address");
    // if no policies set, open by default
    if (accessControlPolicies.length() == 0) {
      return true;
    }
    bool userHasAccess = false;
    for (uint256 i = 0; i < accessControlPolicies.length(); i++) {
      if (IAccessControl(accessControlPolicies.at(i)).hasAccess(_user, _vault)) {
        userHasAccess = true;
        break;
      }
    }
    return userHasAccess;
  }

  uint256[50] private __gap; // keep some storage slots in case we need to add more variables
}
