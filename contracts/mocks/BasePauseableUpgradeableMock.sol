// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;
import "../security/BasePauseableUpgradeable.sol";

contract BasePauseableUpgradeableMock is BasePauseableUpgradeable {
  constructor() {}

  function initialize(address _governance, address _gatekeeper) external initializer {
    __BasePauseableUpgradeable_init(_governance, _gatekeeper);
  }

  function authorisedUpgrade(address _implementation) external view {
    _authorizeUpgrade(_implementation);
  }
}
