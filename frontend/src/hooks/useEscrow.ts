import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { ESCROW_ADDRESS, ESCROW_ABI, ERC20_ABI, USDC_ADDRESS, ETH_TOKEN } from '../config/contract';
import { hasSubgraph, fetchJobsFor } from '../lib/graph';
import { STATE } from '../theme';
import type { Address } from 'viem';
import type { EscrowWriteArgs, Job, JobRole, Milestone, MilestoneState, TransactionPhase } from '../types';

const escrow = { address: ESCROW_ADDRESS, abi: ESCROW_ABI };

// ── Contract ⇄ UI adapters ─────────────────────────────────────────────────
// The deployed FreelanceEscrow differs from this app's original placeholder in a
// few ways. Everything is normalised here so the pages keep the exact shape they
// already expect:
//   • job ids start at 1 (not 0)
//   • the Job struct carries a `state` enum + `totalAmount`, not `accepted` /
//     `cancelled` bools + `total`
//   • milestones expose `deliverableCid`, not `cid`
//   • MilestoneState index 0 is a NONE sentinel (see STATE in theme.ts)
//   • balances/withdrawals are per-token: pendingWithdrawals(token, who) and
//     withdraw(token)

/** JobState enum in the contract. */
const JOB = { NONE: 0, FUNDED: 1, IN_PROGRESS: 2, COMPLETED: 3, DISPUTED: 4, CANCELLED: 5 };

interface RawJob {
  client: Address; freelancer: Address; arbitrator: Address; token: Address;
  totalAmount: bigint; timelock: bigint; createdAt: bigint; milestoneCount: bigint; state: number;
}

interface RawMilestone { amount: bigint; state: number; deliverableCid: string; submittedAt: bigint }

/** Maps the on-chain Job struct onto the shape the pages consume. */
function adaptJob(raw: unknown): Job | undefined {
  if (!raw) return undefined;
  const value = raw as RawJob;
  const state = Number(value.state);
  if (state === JOB.NONE) return undefined; // job doesn't exist
  return {
    client: value.client,
    freelancer: value.freelancer,
    arbitrator: value.arbitrator,
    token: value.token,
    total: value.totalAmount,
    timelock: value.timelock,
    createdAt: value.createdAt,
    // The design models the lifecycle as two bools; the contract uses an enum.
    accepted: state === JOB.IN_PROGRESS || state === JOB.COMPLETED || state === JOB.DISPUTED,
    cancelled: state === JOB.CANCELLED,
    milestoneCount: Number(value.milestoneCount),
    state,
  };
}

/** Maps an on-chain Milestone onto the shape the pages consume. */
function adaptMilestone(raw: unknown, i: number, job?: Job): Milestone {
  const m = raw as RawMilestone;
  // A job can only be cancelled before acceptance, so its milestones are all still
  // PENDING on-chain — surface them as CANCELLED, which is what the design shows.
  const state = (job?.cancelled ? 'CANCELLED' : STATE[Number(m.state)] || 'PENDING') as MilestoneState;
  return {
    index: i,
    amount: m.amount,
    state,
    cid: m.deliverableCid,
    submittedAt: Number(m.submittedAt),
  };
}

// ── Reads ──────────────────────────────────────────────────────────────────
export function useJob(jobId?: string) {
  const numericId = jobId && /^\d+$/.test(jobId) ? BigInt(jobId) : 0n;
  const { data, refetch, isLoading } = useReadContracts({
    contracts: [
      { ...escrow, functionName: 'getJob', args: [numericId] },
      { ...escrow, functionName: 'getMilestones', args: [numericId] },
    ],
    query: { enabled: numericId > 0n, refetchInterval: 12_000 }, // roughly every block
  });
  const job = adaptJob(data?.[0]?.result);
  const milestones = ((data?.[1]?.result || []) as readonly unknown[]).map((m, i) => adaptMilestone(m, i, job));
  return { job, milestones, refetch, isLoading };
}

export function useJobCount() {
  // The contract's counter holds the LAST assigned id; ids run 1..jobCounter.
  const { data } = useReadContract({ ...escrow, functionName: 'jobCounter' });
  return data ? Number(data) : 0;
}

/**
 * Jobs involving the connected wallet (as client, freelancer, or arbitrator).
 *
 * Reads from the subgraph when `VITE_SUBGRAPH_URL` is set — one indexed query instead
 * of `jobCounter` + a multicall over every job, which is what makes this scale. With
 * no subgraph configured (or if a query fails) it falls back to reading the chain
 * directly, so the app still works against a fresh deployment before the subgraph has
 * synced. Both paths return the identical job shape.
 */
export function useMyJobs() {
  const { address } = useAccount();
  const useGraph = hasSubgraph();

  // --- Subgraph path ---
  const { data: graphJobs, error: graphError } = useQuery({
    queryKey: ['myJobs', address],
    queryFn: () => fetchJobsFor(address as Address),
    enabled: useGraph && !!address,
    refetchInterval: 12_000,
    retry: 1,
  });

  // --- RPC fallback path (also covers a subgraph query that errored) ---
  const rpcEnabled = !!address && (!useGraph || !!graphError);
  const count = useJobCount();
  const ids = Array.from({ length: count }, (_, i) => i + 1); // ids start at 1
  const { data } = useReadContracts({
    contracts: ids.map((id) => ({ ...escrow, functionName: 'getJob', args: [BigInt(id)] })),
    query: { enabled: rpcEnabled && count > 0 },
  });
  const rpcJobs = (data || [])
    .map((r, i) => {
      const job = adaptJob(r.result);
      return job ? { id: ids[i], ...job } : null;
    })
    .filter((job): job is Job & { id: number } => Boolean(job))
    .filter(
      (j) =>
        address &&
        [j.client, j.freelancer, j.arbitrator].map((a) => a?.toLowerCase()).includes(address.toLowerCase()),
    );

  const jobs = useGraph && !graphError ? graphJobs ?? [] : rpcJobs;
  return { jobs, connected: !!address, source: useGraph && !graphError ? 'subgraph' : 'rpc' };
}

/**
 * Withdrawable balance for the connected wallet.
 * The contract keys balances per token while the design shows a single balance, so:
 * pass a `token` for job-scoped views, or omit it to auto-pick whichever balance is
 * non-zero (ETH first, then USDC). Returns the token alongside the amount so callers
 * can format and withdraw the right one.
 */
export function useWithdrawable(token?: Address) {
  const { address } = useAccount();
  const who = address ?? ETH_TOKEN;
  const probes = [{ ...escrow, functionName: 'pendingWithdrawals', args: [ETH_TOKEN, who] }];
  probes.push({ ...escrow, functionName: 'pendingWithdrawals', args: [USDC_ADDRESS, who] });

  const { data, refetch } = useReadContracts({
    contracts: probes,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });
  const ethAmount = (data?.[0]?.result as bigint | undefined) ?? 0n;
  const usdcAmount = (data?.[1]?.result as bigint | undefined) ?? 0n;

  if (token) {
    const isUsdc = !!USDC_ADDRESS && token.toLowerCase() === USDC_ADDRESS.toLowerCase();
    return { amount: isUsdc ? usdcAmount : ethAmount, token, refetch };
  }
  if (ethAmount > 0n) return { amount: ethAmount, token: ETH_TOKEN, refetch };
  if (usdcAmount > 0n) return { amount: usdcAmount, token: USDC_ADDRESS, refetch };
  return { amount: 0n, token: ETH_TOKEN, refetch };
}

export function useRole(job?: Job): JobRole {
  const { address } = useAccount();
  if (!address || !job) return 'observer';
  const a = address.toLowerCase();
  if (job.client?.toLowerCase() === a) return 'client';
  if (job.freelancer?.toLowerCase() === a) return 'freelancer';
  if (job.arbitrator?.toLowerCase() === a) return 'arbitrator';
  return 'observer';
}

// ── Writes ─────────────────────────────────────────────────────────────────
// One hook per user intent; every write funnels through the same tx lifecycle
// so <TxButton> can render "Confirm in your wallet… / Sending / Done ✓".
export function useEscrowWrite() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: mining, isSuccess } = useWaitForTransactionReceipt({ hash });
  const phase: TransactionPhase = isPending ? 'wallet' : mining ? 'pending' : isSuccess ? 'success' : 'idle';
  const send = <Name extends keyof EscrowWriteArgs>(functionName: Name, args: EscrowWriteArgs[Name], value?: bigint) =>
    writeContract({ ...escrow, functionName, args, ...(value !== undefined ? { value } : {}) } as Parameters<typeof writeContract>[0]);
  return { send, phase, hash, error, reset };
}

export function useUsdcApprove() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: mining, isSuccess } = useWaitForTransactionReceipt({ hash });
  const phase: TransactionPhase = isPending ? 'wallet' : mining ? 'pending' : isSuccess ? 'success' : 'idle';
  const approve = (amount: bigint) =>
    writeContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [ESCROW_ADDRESS, amount] });
  return { approve, phase };
}
