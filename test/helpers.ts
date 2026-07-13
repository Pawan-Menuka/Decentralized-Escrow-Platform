import { ethers } from "hardhat";
import type { FreelanceEscrow } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

export const FEE_BPS = 100n; // 1%
export const BPS_DENOM = 10_000n;
export const DEFAULT_TIMELOCK = 7 * 24 * 60 * 60; // 7 days (within [MIN,MAX])
export const ZERO = ethers.ZeroAddress;

export interface Deployed {
  escrow: FreelanceEscrow;
  owner: HardhatEthersSigner;
  client: HardhatEthersSigner;
  freelancer: HardhatEthersSigner;
  arbitrator: HardhatEthersSigner;
  other: HardhatEthersSigner;
}

/** Deploys a fresh escrow with a 1% fee and a dedicated arbitrator signer. */
export async function deployFixture(): Promise<Deployed> {
  const [owner, client, freelancer, arbitrator, other] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("FreelanceEscrow");
  const escrow = (await Factory.connect(owner).deploy(FEE_BPS, arbitrator.address)) as unknown as FreelanceEscrow;
  await escrow.waitForDeployment();
  return { escrow, owner, client, freelancer, arbitrator, other };
}

/** Creates and funds a job (ETH). Returns the jobId and the total funded. */
export async function createFundedJob(
  escrow: FreelanceEscrow,
  client: HardhatEthersSigner,
  freelancer: HardhatEthersSigner,
  amounts: bigint[],
  timelock: number = DEFAULT_TIMELOCK,
): Promise<{ jobId: bigint; total: bigint }> {
  const total = amounts.reduce((a, b) => a + b, 0n);
  const jobId = (await escrow.jobCounter()) + 1n;
  await escrow.connect(client).createJob(freelancer.address, ZERO, amounts, timelock, { value: total });
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
