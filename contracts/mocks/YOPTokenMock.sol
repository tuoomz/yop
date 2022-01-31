// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

contract YOPTokenMock is ERC20PresetMinterPauser {
  uint256 public constant MAX_SUPPLY = 88888888 * 10**8;

  // solhint-disable-next-line no-empty-blocks
  constructor(string memory name_, string memory symbol_) ERC20PresetMinterPauser(name_, symbol_) {}

  function mint(address _to, uint256 _amount) public override {
    require((totalSupply() + _amount) <= MAX_SUPPLY, "exceed supply limit");
    _mint(_to, _amount);
  }

  function decimals() public view virtual override returns (uint8) {
    return 8;
  }
}
