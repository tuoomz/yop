// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../vaults/BaseVault.sol";

/// @dev this is mainly used to test functions in the BaseVault
contract BaseVaultMock is Initializable, BaseVault, UUPSUpgradeable {
  function initialize(
    string memory _name,
    string memory _symbol,
    address _governance,
    address _gatekeeper,
    address _rewards,
    address _strategyDataStoreAddress
  ) public initializer {
    __BaseVault__init(
      _name,
      _symbol,
      _governance,
      _gatekeeper,
      _rewards,
      _strategyDataStoreAddress,
      address(0),
      address(0)
    );
  }

  // solhint-disable-next-line no-unused-vars
  function _authorizeUpgrade(address implementation) internal override {
    _onlyGovernance();
  }

  function setStrategyDataStore(address _strategyDataStoreContract) external {
    _updateStrategyDataStore(_strategyDataStoreContract);
  }
}
