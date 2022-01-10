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
  ) public virtual initializer {
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

contract BaseVaultMock2 is BaseVaultMock {
  bool internal migrateStrategyResult;
  bool internal addStrategyResult;

  function initialize(
    string memory _name,
    string memory _symbol,
    address _governance,
    address _gatekeeper,
    address _rewards,
    address _strategyDataStoreAddress
  ) public override initializer {
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
    migrateStrategyResult = true;
    addStrategyResult = true;
  }

  // solhint-disable-next-line no-unused-vars
  function migrateStrategy(address _oldVersion, address _newVersion) public override returns (bool) {
    return migrateStrategyResult;
  }

  function setMigrateStrategyResult(bool _result) external {
    migrateStrategyResult = _result;
  }

  // solhint-disable-next-line no-unused-vars
  function addStrategy(address _strategy) public override returns (bool) {
    return addStrategyResult;
  }

  function setAddStrategyResult(bool _result) external {
    addStrategyResult = _result;
  }
}
