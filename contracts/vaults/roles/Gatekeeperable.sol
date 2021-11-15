// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/utils/Context.sol";

/// @dev Add the `Gatekeeper` role.
///   Gatekeepers will help ensure the security of the vaults. They can set vault limits, pause/unpause deposits or withdraws.
///   For vaults that defined restricted access, they will be able to control the access to these vaults as well.
///   This contract also provides a `onlyGatekeeper` modifier to allow controlling access to functions of the contract.
contract Gatekeeperable is Context {
  event GatekeeperUpdated(address _guardian);

  /// @notice the address of the guardian for the vault
  address public gatekeeper;

  // /// @dev make sure msg.sender is the guardian or the governance
  // modifier onlyGovernanceOrGuardian() {
  //   require((_msgSender() == governance) || (_msgSender() == guardian), "governance or guardian only");
  //   _;
  // }

  /// @dev set the initial value for the gatekeeper.
  /// @param _gatekeeper the default address of the guardian
  constructor(address _gatekeeper) {
    require(_msgSender() != _gatekeeper, "invalid address");
    _updateGatekeeper(_gatekeeper);
  }

  ///@dev this can be used internally to update the gatekeep. If you want to expose it, create an external function in the implementation contract and call this.
  function _updateGatekeeper(address _gatekeeper) internal {
    require(_gatekeeper != address(0), "management address is not valid");
    require(_gatekeeper != gatekeeper, "already the guardian");
    gatekeeper = _gatekeeper;
    emit GatekeeperUpdated(_gatekeeper);
  }
}
