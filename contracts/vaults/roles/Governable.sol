// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/utils/Context.sol";

interface IGovernable {
  function proposeGovernance(address _pendingGovernance) external;

  function acceptGovernance() external;
}

/// @dev Add a `governance` and a `pendingGovernance` role to the contract, and implements a 2-phased nominatiom process to change the governance.
///   Also provides a modifier to allow controlling access to functions of the contract.
contract Governable is IGovernable, Context {
  event GovenanceUpdated(address _govenance);
  event GovenanceProposed(address _pendingGovenance);

  /// @notice the address of the current governance
  address public governance;
  /// @notice the address of the pending governance
  address public pendingGovernance;

  /// @dev ensure msg.send is the governanace
  modifier onlyGovernance() {
    require(_msgSender() == governance, "governance only");
    _;
  }

  /// @dev ensure msg.send is the pendingGovernance
  modifier onlyPendingGovernance() {
    require(_msgSender() == pendingGovernance, "pending governance only");
    _;
  }

  /// @dev the deployer of the contract will be set as the initial governance
  constructor() {
    _updateGovernance(_msgSender());
  }

  ///@notice propose a new governance of the vault. Only can be called by the existing governance.
  ///@param _pendingGovernance the address of the pending governance
  function proposeGovernance(address _pendingGovernance) external onlyGovernance {
    require(_pendingGovernance != address(0), "governance address is not valid");
    require(_pendingGovernance != governance, "already the governance");
    pendingGovernance = _pendingGovernance;
    emit GovenanceProposed(_pendingGovernance);
  }

  ///@notice accept the proposal to be the governance of the vault. Only can be called by the pending governance.
  function acceptGovernance() external onlyPendingGovernance {
    _updateGovernance(pendingGovernance);
  }

  function _updateGovernance(address _pendingGovernance) internal {
    governance = _pendingGovernance;
    emit GovenanceUpdated(governance);
  }

  /// @dev provides an internal function to allow reduce the contract size
  function _onlyGoverance() internal view {
    require(_msgSender() == governance, "governance only");
  }
}
