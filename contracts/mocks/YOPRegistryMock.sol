// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;
import "../registry/YOPRegistry.sol";

contract YOPRegistryMock is YOPRegistry {
  function authorizeUpgrade(address _implementation) external {
    super._authorizeUpgrade(_implementation);
  }
}
