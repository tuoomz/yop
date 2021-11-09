// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "./IAccessControl.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "../vaults/roles/Governable.sol";
import "../vaults/roles/Gatekeeperable.sol";

contract ERC1155AccessControl is IAccessControl, Gatekeeperable, Governable {
  modifier onlyGovernanceOrGatekeeper() {
    require((_msgSender() == governance) || (_msgSender() == gatekeeper), "govenance or gatekeeper only");
    _;
  }

  using EnumerableSet for EnumerableSet.AddressSet;

  EnumerableSet.AddressSet private erc1155Addresses;

  mapping(address => uint256) private vaultToNftId;

  constructor(address _nftContractAddress) Gatekeeperable(msg.sender) Governable() {
    require(_nftContractAddress != address(0), "invalid nft address");
    erc1155Addresses.add(_nftContractAddress);
  }

  function hasAccess(address _user, address _vault) external view returns (bool) {
    require(_vault != address(0), "invalid vault address");
    require(_user != address(0), "invalid user address");
    bool userHasAccess = false;
    for (uint256 i = 0; i < erc1155Addresses.length(); i++) {
      //if (address(erc1155Addresses.at(i).balanceOf(_user, vaultToNftId[_vault])) {
      ERC1155 erc = ERC1155(erc1155Addresses.at(i));
      if (erc.balanceOf(_user, vaultToNftId[_vault]) > 0) {
        userHasAccess = true;
        break;
      }
    }
    return userHasAccess;
  }

  function addVaultToNftMapping(address _vault, uint256 _nftId) external onlyGovernanceOrGatekeeper {
    require(_vault != address(0), "invalid vault address");
    vaultToNftId[_vault] = _nftId;
  }

  function removeVaultToNftMapping(address _vault) external onlyGovernanceOrGatekeeper {
    require(_vault != address(0), "invalid vault address");
    vaultToNftId[_vault] = 0;
  }
}
