// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TetherToken is ERC20{

    constructor(uint initialBalance) ERC20("TetherToken", "USDT") {
        _mint(msg.sender, initialBalance);
    }
}