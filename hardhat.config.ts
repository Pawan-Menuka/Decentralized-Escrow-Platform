import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

// Normalize the deployer key: accept it with or without the `0x` prefix
// (MetaMask exports private keys without it).
const rawKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
const deployerKey = rawKey ? (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) : undefined;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL ?? "",
      accounts: deployerKey ? [deployerKey] : [],
    },
  },
  etherscan: { apiKey: process.env.ETHERSCAN_API_KEY ?? "" },
  gasReporter: { enabled: process.env.REPORT_GAS === "true" },
};
export default config;
