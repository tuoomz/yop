// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

contract TokenMock is ERC20PresetMinterPauser {
  // solhint-disable-next-line no-empty-blocks
  constructor(string memory name_, string memory symbol_) ERC20PresetMinterPauser(name_, symbol_) {}
}
