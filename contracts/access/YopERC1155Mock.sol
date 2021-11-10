// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

// This mock ERC155 si needed to test the NFT access control.
contract YopERC1155Mock is ERC1155 {
  constructor(uint256 _numberOfTokens) ERC1155("https://yop.finance/api/item/{id}.json") {
    _mint(msg.sender, 1, _numberOfTokens, "");
    _mint(msg.sender, 2, _numberOfTokens, "");
  }
}
