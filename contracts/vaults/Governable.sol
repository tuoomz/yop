// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/utils/Context.sol";

interface IGovernable {
  function proposeGovernance(address _pendingGovernance) external;

  function acceptGovernance() external;
}

contract Governable is IGovernable, Context {
  event GovenanceUpdated(address _govenance);
  event GovenanceProposed(address _pendingGovenance);

  /// @dev the address of the current governance
  address public governance;
  /// @dev the address of the pending governance
  address public pendingGovernance;

  modifier onlyGovernance() {
    require(_msgSender() == governance, "governance only");
    _;
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
  function acceptGovernance() external {
    require(pendingGovernance == _msgSender(), "invalid pending governance");
    _updateGovernance(pendingGovernance);
  }

  function _updateGovernance(address _pendingGovernance) internal {
    governance = _pendingGovernance;
    emit GovenanceUpdated(governance);
  }
}
