// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "./Governable.sol";

interface IManageable {
  function setManagement(address _management) external;

  function management() external returns (address);
}

contract Manageable is IManageable, Governable {
  event ManagementUpdated(address _management);
  /// @dev the address of the management for the vault
  address public management;

  modifier onlyManagement() {
    require(_msgSender() == management, "management only");
    _;
  }

  modifier onlyGovernanceOrManagement() {
    require((_msgSender() == governance) || (_msgSender() == management), "govenance or management only");
    _;
  }

  ///@notice set the management of the vault to be the new _management. Only can be called by the governance.
  ///@param _management the address of the new management
  function setManagement(address _management) external onlyGovernanceOrManagement {
    require(_management != address(0), "management address is not valid");
    require(_management != management, "already the management");
    _updateManagement(_management);
  }

  function _updateManagement(address _management) internal {
    management = _management;
    emit ManagementUpdated(management);
  }
}
