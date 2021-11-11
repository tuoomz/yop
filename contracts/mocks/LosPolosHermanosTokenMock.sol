// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LosPolosHermanosTokenMock is ERC20 {
  // solhint-disable-next-line no-empty-blocks
  constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

  function mint(address _to, uint256 _amount) external {
    _mint(_to, _amount);
  }
}
