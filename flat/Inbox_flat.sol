// Sources flattened with hardhat v2.6.7 https://hardhat.org

// File contracts/Inbox.sol

// SPDX-License-Identifier: MIT

pragma solidity =0.8.9;

contract Inbox {
  string public message;

  constructor(string memory initialMessage) {
    message = initialMessage;
  }

  function setMessage(string memory newMessage) public {
    message = newMessage;
  }
}
