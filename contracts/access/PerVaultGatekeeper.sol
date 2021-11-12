// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;
import "../vaults/roles/Governable.sol";

contract PerVaultGatekeeper is Governable {
  event GatekeeperUpdated(address indexed _gatekeeper, address indexed _vault);

  mapping(address => address) public vaultGatekeepers;

  // solhint-disable-next-line no-empty-blocks
  constructor(address _governance) Governable(_governance) {}

  function setVaultGatekeeper(address _vault, address _gatekeeper) external onlyGovernance {
    require(_vault != address(0) && _gatekeeper != address(0), "invalid address");
    vaultGatekeepers[_vault] = _gatekeeper;
    emit GatekeeperUpdated(_gatekeeper, _vault);
  }

  function _onlyGovernanceOrGatekeeper(address _vault) internal view {
    require(_msgSender() == governance || _msgSender() == vaultGatekeepers[_vault], "not authorised");
  }
}
