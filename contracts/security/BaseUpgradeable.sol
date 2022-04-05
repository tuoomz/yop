// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../vaults/roles/Governable.sol";

/// @dev Use this contract as the base for contracts that are going to be upgradeable.
abstract contract BaseUpgradeable is GovernableUpgradeable, UUPSUpgradeable {
  // solhint-disable-next-line no-empty-blocks
  constructor() {}

  // solhint-disable-next-line func-name-mixedcase
  function __BaseUpgradeable_init(address _governance) internal onlyInitializing {
    __Governable_init(_governance);
    __UUPSUpgradeable_init();
    __BaseUpgradeable_init_unchained();
  }

  // solhint-disable-next-line func-name-mixedcase no-empty-blocks
  function __BaseUpgradeable_init_unchained() internal onlyInitializing {}

  // solhint-disable-next-line no-unused-vars no-empty-blocks
  function _authorizeUpgrade(address implementation) internal view override onlyGovernance {}
}
