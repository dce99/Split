import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
require('dotenv').config();

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  // networks: {
  //   hardhat: {
  //     accounts: {
  //       mnemonic: process.env.SEED_PHRASE,
  //     },
  //     chainId: 1337
  //   }
  // }
};

export default config;
