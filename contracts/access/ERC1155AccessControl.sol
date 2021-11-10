// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "./IAccessControl.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "../vaults/roles/Governable.sol";
import "../vaults/roles/Gatekeeperable.sol";

contract ERC1155AccessControl is IAccessControl, Gatekeeperable, Governable {
  modifier onlyGovernanceOrGatekeeper() {
    require((_msgSender() == governance) || (_msgSender() == gatekeeper), "governance or gatekeeper only");
    _;
  }
  using EnumerableSet for EnumerableSet.UintSet;

  ERC1155 private erc1155;

  mapping(address => EnumerableSet.UintSet) private vaultToNftIds;

  constructor(
    address _nftContractAddress,
    address _gatekeeper,
    address _governer
  ) Gatekeeperable(_gatekeeper) Governable(_governer) {
    require(_nftContractAddress != address(0), "invalid nft address");
    erc1155 = ERC1155(_nftContractAddress);
  }

  function hasAccess(address _user, address _vault) external view returns (bool) {
    require(_vault != address(0), "invalid vault address");

    require(_user != address(0), "invalid user address");
    bool userHasAccess = false;
    for (uint256 i = 0; i < vaultToNftIds[_vault].length(); i++) {
      if (erc1155.balanceOf(_user, vaultToNftIds[_vault].at(i)) > 0) {
        userHasAccess = true;
        break;
      }
    }
    return userHasAccess;
  }

  /**
   * @notice Allows user to set which NFT can access a vault
   * It takes two list as paramaters. A list of vaults and a list
   * of ERC1155 ids.
   * eg. vaults [0x1, 0x1, 0x2] ids = [ 1, 2, 2] the mapping wil be:
   * 0x1 -> 1
   * 0x1 -> 2
   * 0x2 -> 2
   * The mapping is based on the order of the two arrays, ie the first vault is mapped to the first id and so on
   */

  function addVaultToNftMapping(address[] calldata _vaults, uint256[] calldata _nftIds)
    external
    onlyGovernanceOrGatekeeper
  {
    require(_vaults.length == _nftIds.length, "invalid input");
    for (uint256 i = 0; i < _vaults.length; i++) {
      require(_vaults[i] != address(0), "invalid vault address");
      vaultToNftIds[_vaults[i]].add(_nftIds[i]);
    }
  }

  /**
   * @notice Allows user to remove vault acces for a list of ids
   * The parameters work in the same was as the add the addVaultToNftMapping
   */

  function removeVaultToNftMapping(address[] calldata _vaults, uint256[] calldata _nftIds)
    external
    onlyGovernanceOrGatekeeper
  {
    require(_vaults.length == _nftIds.length, "invalid input");
    for (uint256 i = 0; i < _vaults.length; i++) {
      require(_vaults[i] != address(0), "invalid vault address");
      vaultToNftIds[_vaults[i]].remove(_nftIds[i]);
    }
  }

  function setGatekeeper(address _gatekeeper) external onlyGovernance {
    require(_gatekeeper != address(0), "invalid gatekeeper");
    _updateGatekeeper(_gatekeeper);
  }
}
