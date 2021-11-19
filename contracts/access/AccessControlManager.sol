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

  event AccessControlPolicyAdded(address indexed _vault, address indexed _policy);
  event AccessControlPolicyRemoved(address indexed _vault, address indexed _policy);
}

// This implementation will allow us to set an allowed list of user addresses
contract AccessControlManager is AbstractAccessControlManager, PerVaultGatekeeper {
  // Add the library methods
  using EnumerableSet for EnumerableSet.AddressSet;

  mapping(address => EnumerableSet.AddressSet) internal accessControlPolicies;

  // solhint-disable-next-line no-empty-blocks
  constructor(address _governance) PerVaultGatekeeper(_governance) {}

  function addAccessControlPolicies(address _vault, address[] calldata _policies) external {
    _onlyGovernanceOrGatekeeper(_vault);
    _addAccessControlPolicys(_vault, _policies);
  }

  function removeAccessControlPolicies(address _vault, address[] calldata _policies) external {
    _onlyGovernanceOrGatekeeper(_vault);
    _removeAccessControlPolicys(_vault, _policies);
  }

  function getAccessControlPolicies(address _vault) external view returns (address[] memory) {
    return accessControlPolicies[_vault].values();
  }

  // Had to use memory here instead of calldata as the function is
  // used in the constructor
  function _addAccessControlPolicys(address _vault, address[] calldata _policies) internal {
    for (uint256 i = 0; i < _policies.length; i++) {
      if (_policies[i] != address(0)) {
        bool added = accessControlPolicies[_vault].add(_policies[i]);
        if (added) {
          emit AccessControlPolicyAdded(_vault, _policies[i]);
        }
      }
    }
  }

  function _removeAccessControlPolicys(address _vault, address[] calldata _policies) internal {
    for (uint256 i = 0; i < _policies.length; i++) {
      if (_policies[i] != address(0)) {
        bool removed = accessControlPolicies[_vault].remove(_policies[i]);
        if (removed) {
          emit AccessControlPolicyRemoved(_vault, _policies[i]);
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
    if (accessControlPolicies[_vault].length() == 0) {
      return true;
    }
    bool userHasAccess = false;
    for (uint256 i = 0; i < accessControlPolicies[_vault].length(); i++) {
      if (IAccessControl(accessControlPolicies[_vault].at(i)).hasAccess(_user, _vault)) {
        userHasAccess = true;
        break;
      }
    }
    return userHasAccess;
  }
}
