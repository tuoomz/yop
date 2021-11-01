// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "./Governable.sol";

interface IGuardianable {
  function guardian() external returns (address);

  function setGuardian(address _guardian) external;
}

contract Guardianable is IGuardianable, Governable {
  event GuardianUpdated(address _guardian);

  /// @dev the address of the guardian for the vault
  address public guardian;

  modifier onlyGuardian() {
    require(_msgSender() == guardian, "guardian only");
    _;
  }

  modifier onlyGovernanceOrGuardian() {
    require((_msgSender() == governance) || (_msgSender() == guardian), "governance or guardian only");
    _;
  }

  ///@notice set the guardian of the vault to be the new _guardian. Only can be called by the governance.
  ///@param _guardian the address of the new guardian
  function setGuardian(address _guardian) external onlyGovernanceOrGuardian {
    require(_guardian != address(0), "management address is not valid");
    require(_guardian != guardian, "already the guardian");
    _updateGuardian(_guardian);
  }

  function _updateGuardian(address _guardian) internal {
    guardian = _guardian;
    emit GuardianUpdated(guardian);
  }
}
