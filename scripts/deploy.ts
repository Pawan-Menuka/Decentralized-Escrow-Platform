import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Deploys FreelanceEscrow.
 *
 * Reads from env (see .env.example):
 *   FEE_BPS            - protocol fee in basis points (default 100 = 1%)
 *   ARBITRATOR_ADDRESS - global arbitrator (defaults to the deployer if empty)
 *   ETH_USD_FEED       - Chainlink ETH/USD aggregator. Required on a live network.
 *                        If unset (e.g. local hardhat), a MockV3Aggregator is deployed.
 *
 * Writes deployments/<network>.json with everything needed to verify + wire the
 * subgraph/frontend, and prints the exact `hardhat verify` command.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const feeBps = Number(process.env.FEE_BPS ?? "100");
  const arbitrator = process.env.ARBITRATOR_ADDRESS?.trim() || deployer.address;

  // Resolve the price feed: use the configured one, or deploy a mock on local networks.
  let ethUsdFeed = process.env.ETH_USD_FEED?.trim();
  let mockFeed: string | undefined;
  if (!ethUsdFeed) {
    if (network.name !== "hardhat" && network.name !== "localhost") {
      throw new Error(`ETH_USD_FEED must be set for network "${network.name}" (a live deploy needs a real feed).`);
    }
    const Mock = await ethers.getContractFactory("MockV3Aggregator");
    const mock = await Mock.deploy(8, 2000n * 10n ** 8n); // $2000, 8 decimals
    await mock.waitForDeployment();
    ethUsdFeed = await mock.getAddress();
    mockFeed = ethUsdFeed;
    console.log(`No ETH_USD_FEED set — deployed a MockV3Aggregator at ${ethUsdFeed}`);
  }

  console.log(`Network:    ${network.name}`);
  console.log(`Deployer:   ${deployer.address}`);
  console.log(`feeBps:     ${feeBps}`);
  console.log(`arbitrator: ${arbitrator}`);
  console.log(`ethUsdFeed: ${ethUsdFeed}`);

  const Factory = await ethers.getContractFactory("FreelanceEscrow");
  const escrow = await Factory.deploy(feeBps, arbitrator, ethUsdFeed);
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  const tx = escrow.deploymentTransaction();
  const receipt = tx ? await tx.wait() : null;

  console.log(`\n✅ FreelanceEscrow deployed to ${address}`);
  console.log(`   tx: ${tx?.hash}  block: ${receipt?.blockNumber}`);

  const record = {
    network: network.name,
    address,
    constructorArgs: { feeBps, arbitrator, ethUsdFeed },
    deployer: deployer.address,
    txHash: tx?.hash ?? null,
    blockNumber: receipt?.blockNumber ?? null,
    mockFeed: mockFeed ?? null,
    timestamp: new Date().toISOString(),
  };
  const dir = join(__dirname, "..", "deployments");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${network.name}.json`), JSON.stringify(record, null, 2) + "\n");
  console.log(`   wrote deployments/${network.name}.json`);

  console.log(`\nVerify with:\n  npx hardhat verify --network ${network.name} ${address} ${feeBps} ${arbitrator} ${ethUsdFeed}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
