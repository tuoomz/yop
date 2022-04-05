// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;
import "../security/BaseUpgradeable.sol";

contract BaseUpgradeableMock is BaseUpgradeable {
  function initialize(address _governance) external initializer {
    __BaseUpgradeable_init(_governance);
  }

  function authorizeUpgrade(address _implementation) external {
    super._authorizeUpgrade(_implementation);
  }
}
