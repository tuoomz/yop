// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/utils/Context.sol";

/// @dev Add a `manager` role to the contract. Managers are responsible for the day-to-day management of Vaults and Strategie.
///  They can configure Strategies and their allocations in a Vault.
///  This contract also provides a few modifiers to allow controlling access to functions of the contract.
contract Manageable is Context {
  event ManagerUpdated(address _manager);
  /// @notice the address of the manager for the vault
  address public manager;

  /// @dev make sure msg.sender is the management
  modifier onlyManager() {
    require(_msgSender() == manager, "manager only");
    _;
  }

  /// @dev set the initial value for the manager.
  /// @param _manager the default address of the _manager
  constructor(address _manager) {
    require(_msgSender() != _manager, "invalid address");
    _updateManager(_manager);
  }

  ///@dev this can be used internally to update the manager. If you want to expose it, create an external function in the implementation contract and call this.
  function _updateManager(address _manager) internal {
    require(_manager != address(0), "manager address is not valid");
    require(_manager != manager, "already the manager");
    manager = _manager;
    emit ManagerUpdated(_manager);
  }

  function _onlyManager() internal view {
    require(_msgSender() == manager, "manager only");
  }
}
