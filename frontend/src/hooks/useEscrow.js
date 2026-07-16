import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { ESCROW_ADDRESS, ESCROW_ABI, ERC20_ABI, USDC_ADDRESS, ETH_TOKEN } from '../config/contract';
import { STATE } from '../theme';

const escrow = { address: ESCROW_ADDRESS, abi: ESCROW_ABI };

// ── Contract ⇄ UI adapters ─────────────────────────────────────────────────
// The deployed FreelanceEscrow differs from this app's original placeholder in a
// few ways. Everything is normalised here so the pages keep the exact shape they
// already expect:
//   • job ids start at 1 (not 0)
//   • the Job struct carries a `state` enum + `totalAmount`, not `accepted` /
//     `cancelled` bools + `total`
//   • milestones expose `deliverableCid`, not `cid`
//   • MilestoneState index 0 is a NONE sentinel (see STATE in theme.js)
//   • balances/withdrawals are per-token: pendingWithdrawals(token, who) and
//     withdraw(token)

/** JobState enum in the contract. */
const JOB = { NONE: 0, FUNDED: 1, IN_PROGRESS: 2, COMPLETED: 3, DISPUTED: 4, CANCELLED: 5 };

/** Maps the on-chain Job struct onto the shape the pages consume. */
function adaptJob(raw) {
  if (!raw) return undefined;
  const state = Number(raw.state);
  if (state === JOB.NONE) return undefined; // job doesn't exist
  return {
    client: raw.client,
    freelancer: raw.freelancer,
    arbitrator: raw.arbitrator,
    token: raw.token,
    total: raw.totalAmount,
    timelock: raw.timelock,
    createdAt: raw.createdAt,
    // The design models the lifecycle as two bools; the contract uses an enum.
    accepted: state === JOB.IN_PROGRESS || state === JOB.COMPLETED || state === JOB.DISPUTED,
    cancelled: state === JOB.CANCELLED,
    milestoneCount: Number(raw.milestoneCount),
    state,
  };
}

/** Maps an on-chain Milestone onto the shape the pages consume. */
function adaptMilestone(m, i, job) {
  // A job can only be cancelled before acceptance, so its milestones are all still
  // PENDING on-chain — surface them as CANCELLED, which is what the design shows.
  const state = job?.cancelled ? 'CANCELLED' : STATE[Number(m.state)] || 'PENDING';
  return {
    index: i,
    amount: m.amount,
    state,
    cid: m.deliverableCid,
    submittedAt: Number(m.submittedAt),
  };
}

// ── Reads ──────────────────────────────────────────────────────────────────
export function useJob(jobId) {
  const { data, refetch, isLoading } = useReadContracts({
    contracts: [
      { ...escrow, functionName: 'getJob', args: [BigInt(jobId)] },
      { ...escrow, functionName: 'getMilestones', args: [BigInt(jobId)] },
    ],
    query: { refetchInterval: 12_000 }, // roughly every block
  });
  const job = adaptJob(data?.[0]?.result);
  const milestones = (data?.[1]?.result || []).map((m, i) => adaptMilestone(m, i, job));
  return { job, milestones, refetch, isLoading };
}

export function useJobCount() {
  // The contract's counter holds the LAST assigned id; ids run 1..jobCounter.
  const { data } = useReadContract({ ...escrow, functionName: 'jobCounter' });
  return data ? Number(data) : 0;
}

// All jobs, filtered client-side to ones involving `address`.
// TODO: swap for a subgraph / indexer query once job volume grows.
export function useMyJobs() {
  const { address } = useAccount();
  const count = useJobCount();
  const ids = Array.from({ length: count }, (_, i) => i + 1); // ids start at 1
  const { data } = useReadContracts({
    contracts: ids.map((id) => ({ ...escrow, functionName: 'getJob', args: [BigInt(id)] })),
    query: { enabled: count > 0 },
  });
  const mine = (data || [])
    .map((r, i) => {
      const job = adaptJob(r.result);
      return job ? { id: ids[i], ...job } : null;
    })
    .filter(Boolean)
    .filter(
      (j) =>
        address &&
        [j.client, j.freelancer, j.arbitrator].map((a) => a?.toLowerCase()).includes(address.toLowerCase()),
    );
  return { jobs: mine, connected: !!address };
}

/**
 * Withdrawable balance for the connected wallet.
 * The contract keys balances per token while the design shows a single balance, so:
 * pass a `token` for job-scoped views, or omit it to auto-pick whichever balance is
 * non-zero (ETH first, then USDC). Returns the token alongside the amount so callers
 * can format and withdraw the right one.
 */
export function useWithdrawable(token) {
  const { address } = useAccount();
  const probes = [{ ...escrow, functionName: 'pendingWithdrawals', args: [ETH_TOKEN, address] }];
  if (USDC_ADDRESS) probes.push({ ...escrow, functionName: 'pendingWithdrawals', args: [USDC_ADDRESS, address] });

  const { data, refetch } = useReadContracts({
    contracts: probes,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });
  const ethAmount = data?.[0]?.result ?? 0n;
  const usdcAmount = data?.[1]?.result ?? 0n;

  if (token) {
    const isUsdc = !!USDC_ADDRESS && token.toLowerCase() === USDC_ADDRESS.toLowerCase();
    return { amount: isUsdc ? usdcAmount : ethAmount, token, refetch };
  }
  if (ethAmount > 0n) return { amount: ethAmount, token: ETH_TOKEN, refetch };
  if (usdcAmount > 0n) return { amount: usdcAmount, token: USDC_ADDRESS, refetch };
  return { amount: 0n, token: ETH_TOKEN, refetch };
}

export function useRole(job) {
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
  const phase = isPending ? 'wallet' : mining ? 'pending' : isSuccess ? 'success' : 'idle';
  const send = (functionName, args, value) =>
    writeContract({ ...escrow, functionName, args, ...(value ? { value } : {}) });
  return { send, phase, hash, error, reset };
}

export function useUsdcApprove() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: mining, isSuccess } = useWaitForTransactionReceipt({ hash });
  const phase = isPending ? 'wallet' : mining ? 'pending' : isSuccess ? 'success' : 'idle';
  const approve = (amount) =>
    writeContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [ESCROW_ADDRESS, amount] });
  return { approve, phase };
}
