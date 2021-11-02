// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "./AccessControlManager.sol";

// This Mock will allow us test the access control mananger
contract AccessControlManagerMock is AccessControlManager {
  constructor(address _accessControlPolicy) AccessControlManager(_accessControlPolicy) {}

  function addAccessControlManager(address _policy) public {
    _addAccessControlManager(_policy);
  }

  function removeAccessControlManager(address _policy) internal onlyGovernance {
    _removeAccessControlManager(_policy);
  }
}
