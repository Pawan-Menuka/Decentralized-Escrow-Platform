import { ethers } from "hardhat";
import type { FreelanceEscrow } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

export const FEE_BPS = 100n; // 1%
export const BPS_DENOM = 10_000n;
export const DEFAULT_TIMELOCK = 7 * 24 * 60 * 60; // 7 days (within [MIN,MAX])
export const ZERO = ethers.ZeroAddress;

// ETH/USD price feed (8 decimals, like Chainlink's real feed): $2000.00 per ETH.
export const ETH_USD_DECIMALS = 8;
export const ETH_USD_PRICE = 2000n * 10n ** 8n; // 200000000000
/** USD helper: dollars -> 8-decimal feed units. usd(500) === $500.00. */
export function usd(dollars: number): bigint {
  return BigInt(Math.round(dollars * 100)) * 10n ** 6n; // *100 cents then *1e6 -> 8 decimals
}
/** Converts an 8-decimal USD amount to wei at ETH_USD_PRICE, matching the contract. */
export function usdToWei(usdAmount: bigint, price: bigint = ETH_USD_PRICE): bigint {
  return (usdAmount * 10n ** 18n) / price;
}

export interface Deployed {
  escrow: FreelanceEscrow;
  feed: any; // MockV3Aggregator
  owner: HardhatEthersSigner;
  client: HardhatEthersSigner;
  freelancer: HardhatEthersSigner;
  arbitrator: HardhatEthersSigner;
  other: HardhatEthersSigner;
}

/** Deploys a fresh escrow with a 1% fee, a dedicated arbitrator, and a mock ETH/USD feed. */
export async function deployFixture(): Promise<Deployed> {
  const [owner, client, freelancer, arbitrator, other] = await ethers.getSigners();
  const Feed = await ethers.getContractFactory("MockV3Aggregator");
  const feed = await Feed.deploy(ETH_USD_DECIMALS, ETH_USD_PRICE);
  await feed.waitForDeployment();
  const Factory = await ethers.getContractFactory("FreelanceEscrow");
  const escrow = (await Factory.connect(owner).deploy(
    FEE_BPS,
    arbitrator.address,
    await feed.getAddress(),
  )) as unknown as FreelanceEscrow;
  await escrow.waitForDeployment();
  return { escrow, feed, owner, client, freelancer, arbitrator, other };
}

/**
 * Creates and funds a job (ETH). Returns the jobId and the total funded.
 * `arbitrator` defaults to ZERO, which makes the contract fall back to its default
 * (global) arbitrator — matching the pre-per-job-arbitrator behaviour.
 */
export async function createFundedJob(
  escrow: FreelanceEscrow,
  client: HardhatEthersSigner,
  freelancer: HardhatEthersSigner,
  amounts: bigint[],
  timelock: number = DEFAULT_TIMELOCK,
  arbitrator: string = ZERO,
): Promise<{ jobId: bigint; total: bigint }> {
  const total = amounts.reduce((a, b) => a + b, 0n);
  const jobId = (await escrow.jobCounter()) + 1n;
  await escrow
    .connect(client)
    .createJob(freelancer.address, arbitrator, ZERO, amounts, timelock, { value: total });
  return { jobId, total };
}

/** fee = floor(gross * feeBps / 10000); net = gross - fee. */
export function feeOf(gross: bigint, feeBps: bigint = FEE_BPS): { fee: bigint; net: bigint } {
  const fee = (gross * feeBps) / BPS_DENOM;
  return { fee, net: gross - fee };
}

// Milestone state enum ordinals (must match the contract).
export const MS = {
  NONE: 0n,
  PENDING: 1n,
  SUBMITTED: 2n,
  APPROVED: 3n,
  DISPUTED: 4n,
  RESOLVED: 5n,
  AUTO_RELEASED: 6n,
} as const;

// Job state enum ordinals (must match the contract).
export const JS = {
  NONE: 0n,
  FUNDED: 1n,
  IN_PROGRESS: 2n,
  COMPLETED: 3n,
  DISPUTED: 4n,
  CANCELLED: 5n,
} as const;
