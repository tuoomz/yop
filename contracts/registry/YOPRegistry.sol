// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../vaults/roles/Governable.sol";
import "../interfaces/IVault.sol";
import "../interfaces/IYOPRegistry.sol";

/// @notice The main on-chain registry to allow querying addresses of YOP components.
///  For now it supports querying vault addresses, or query vault addresses using token addresses.
///  Will add more features in the future.
contract YOPRegistry is IYOPRegistry, GovernableUpgradeable, UUPSUpgradeable {
  event VaultRegistered(address _token, address _vault);
  /// @notice addresses for all the YOP vaults
  address[] public allVaults;
  // token => vaults mapping, supports 1:n relationship
  // the last one will be the current vault for this token, can have duplicate entries
  mapping(address => address[]) internal vaultsForToken;
  // vault => token look up, and also be used to check if a vault exists
  mapping(address => address) internal tokenForVault;

  function initialize(address _governance) external initializer {
    __YOPRegistry_init(_governance);
  }

  function __YOPRegistry_init(address _governance) internal onlyInitializing {
    __Governable_init(_governance);
  }

  /// @notice Get the current vault address for the given token address
  /// @param _token The token address
  /// @return The current vault for the token. Will return address(0) if no vaults for the token found
  function currentVault(address _token) external view returns (address) {
    uint256 numberOfVaults = vaultsForToken[_token].length;
    if (numberOfVaults > 0) {
      return vaultsForToken[_token][numberOfVaults - 1];
    }
    return address(0);
  }

  /// @notice The number of total vaults.
  function totalVaults() external view returns (uint256) {
    return allVaults.length;
  }

  /// @notice Get the token for the given vault
  /// @param _vault The address of the vault
  /// @return The token address of the vault. Will return address(0) if vault is not found
  function vaultToken(address _vault) external view returns (address) {
    return tokenForVault[_vault];
  }

  /// @notice Check is the given _vault address is a registerred YOP vault
  /// @param _vault The address of the vault to check
  /// @return If the vault address is a YOP vault
  function isVault(address _vault) external view returns (bool) {
    return tokenForVault[_vault] != address(0);
  }

  /// @notice Register the vault. Can only be called by governance.
  /// @param _vault The vault address to register
  function registerVault(address _vault) external onlyGovernance {
    require(_vault != address(0), "!vault");
    require(tokenForVault[_vault] == address(0), "registered");
    address token = IVault(_vault).token();
    allVaults.push(_vault);
    vaultsForToken[token].push(_vault);
    tokenForVault[_vault] = token;
    emit VaultRegistered(token, _vault);
  }

  // solhint-disable-next-line no-unused-vars no-empty-blocks
  function _authorizeUpgrade(address implementation) internal view override onlyGovernance {}
}
