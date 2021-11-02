// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./AllowListAccessControl.sol";
import "../vaults/Governable.sol";

// this interface will allow us to implement different types of access policies for Vaults.
// e.g. allowedList/blockedlist based, NFT based etc. Then a vault can reuse these to control access to them.

abstract contract AbstractAccessControlManager {
  /// @notice access policies set on the vault

  event AccessControlManagerAdded(address _policy);
  event AccessControlManagerRemoved(address _policy);
}

// This implementation will allow us to set an allowed list of user addresses
contract AccessControlManager is AbstractAccessControlManager, Governable {
  address[] public accessControlPolicies;

  constructor(address _accessControlPolicy) {
    if (_accessControlPolicy != address(0)) {
      accessControlPolicies.push(_accessControlPolicy);
    }
  }

  function _addAccessControlManager(address _policy) internal onlyGovernance {
    require(_policy != address(0), "invalid address");
    accessControlPolicies.push(_policy);
    emit AccessControlManagerAdded(_policy);
  }

  function _removeAccessControlManager(address _policy) internal onlyGovernance {
    require(_policy != address(0), "invalid address");
    for (uint256 i; i < accessControlPolicies.length; i++) {
      if (accessControlPolicies[i] == _policy)
        ///@dev to efeciently delete from an array without preserving order move the last item to
        // the deleted items index.
        accessControlPolicies[i] = accessControlPolicies[accessControlPolicies.length - 1];
      accessControlPolicies.pop();
      emit AccessControlManagerRemoved(_policy);
    }
  }

  function hasAccess(address _user, address _vault) external view returns (bool) {
    return _hasAccess(_user, _vault);
  }

  function _hasAccess(address _user, address _vault) internal view returns (bool) {
    bool userHasAccess = false;
    for (uint256 i = 0; i < accessControlPolicies.length; i++) {
      if (IAccessControl(accessControlPolicies[i]).hasAccess(_user, _vault)) {
        userHasAccess = true;
        break;
      }
    }
    return userHasAccess;
  }
}
