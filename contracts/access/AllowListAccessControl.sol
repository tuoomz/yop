// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IAccessControl {
  function hasAccess(address _user, address _vault) external view returns (bool);
}

contract AllowlistAccessControl is IAccessControl {
  mapping(address => bool) public globalAccessMap;
  mapping(address => mapping(address => bool)) public vaultAccessMap;

  function allowGlobalAccess(address[] calldata _users) external {
    _updateGlobalAccess(_users, true);
  }

  function removeGlobalAccess(address[] calldata _users) external {
    _updateGlobalAccess(_users, false);
  }

  function allowVaultAccess(address[] calldata _users, address vault) external {
    _updateAllowVaultAccess(_users, vault, true);
  }

  function removeVaultAccess(address[] calldata _users, address vault) external {
    _updateAllowVaultAccess(_users, vault, false);
  }

  function _hasAccess(address _user, address _vault) internal view returns (bool) {
    return globalAccessMap[_user] || vaultAccessMap[_user][_vault];
  }

  function hasAccess(address _user, address _vault) external view returns (bool) {
    return _hasAccess(_user, _vault);
  }

  /// @dev updates the users global access
  function _updateGlobalAccess(address[] calldata _users, bool permission) internal {
    for (uint256 i = 0; i < _users.length; i++) {
      require(_users[i] != address(0), "invalid address");
      /// @dev only update mappign if permissions are changed
      if (globalAccessMap[_users[i]] != permission) {
        globalAccessMap[_users[i]] = permission;
      }
    }
  }

  function _updateAllowVaultAccess(
    address[] calldata _users,
    address vault,
    bool permission
  ) internal {
    for (uint256 i = 0; i < _users.length; i++) {
      require(_users[i] != address(0), "invalid address");
      if (vaultAccessMap[_users[i]][vault] != permission) {
        vaultAccessMap[_users[i]][vault] = permission;
      }
    }
  }
}
