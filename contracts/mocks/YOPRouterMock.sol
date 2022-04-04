// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;
import "../router/YOPRouter.sol";

contract YOPRouterMock is YOPRouter {
  function authorizeUpgrade(address _implementation) external {
    super._authorizeUpgrade(_implementation);
  }
}
