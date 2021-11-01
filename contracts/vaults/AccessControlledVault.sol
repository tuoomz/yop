// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

// this interface will allow us to implement different types of access policies for Vaults.
// e.g. whitelist/blacklist based, NFT based etc. Then a vault can reuse these to control access to them.
interface IVaultAccessPolicy {
  /// @notice control if a user can access the given vault
  function canAccess(address vault, address user) external returns (bool);
}

interface IAccessControlledVault {
  /// @notice access policies set on the vault
  function accessPolicies() external view returns (address[] memory);

  function addAccessPolicy(address _accessPolicy) external;

  function removeAccessPolicy(address _accessPolicy) external;
}

contract AccessControlledVault {
  address[] public accessPolicies;
}
