import { useQuery } from '@tanstack/react-query';
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import type { Address } from 'viem';
import { ESCROW_ABI, ESCROW_ADDRESS, ERC20_ABI, ETH_TOKEN, USDC_ADDRESS } from '../config/contract';
import { readService } from '../services/read';
import { roleFor } from '../domain/escrow';
import type { EscrowWriteArgs, Job, JobRole, TransactionPhase } from '../types';

const escrow = { address: ESCROW_ADDRESS, abi: ESCROW_ABI } as const;
const queryPolicy = { staleTime: 12_000, retry: 2, refetchOnWindowFocus: true } as const;

export function useJob(jobId?: string) {
  const id = jobId && /^\d+$/.test(jobId) ? Number(jobId) : 0;
  const query = useQuery({
    queryKey: ['job', id],
    queryFn: () => readService.getJob(id),
    enabled: Number.isSafeInteger(id) && id >= 1,
    refetchInterval: 12_000,
    ...queryPolicy,
  });
  return {
    job: query.data?.data.job,
    milestones: query.data?.data.milestones ?? [],
    source: query.data?.source,
    fallbackReason: query.data?.fallbackReason,
    refetch: query.refetch,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isStale: query.isStale,
    isError: query.isError || id < 1,
    error: id < 1 ? new Error('Job IDs start at 1.') : query.error,
  };
}

export function useJobs(account?: Address) {
  const query = useQuery({
    queryKey: ['jobs', account?.toLowerCase() ?? 'public'],
    queryFn: () => readService.listJobs({ account }),
    refetchInterval: 12_000,
    ...queryPolicy,
  });
  return {
    jobs: query.data?.data ?? [],
    source: query.data?.source,
    fallbackReason: query.data?.fallbackReason,
    refetch: query.refetch,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isStale: query.isStale,
    isError: query.isError,
    error: query.error,
  };
}

export function useActivities(jobId?: string) {
  const id = jobId && /^\d+$/.test(jobId) ? Number(jobId) : 0;
  const query = useQuery({
    queryKey: ['activities', id],
    queryFn: () => readService.getActivities(id),
    enabled: id >= 1,
    refetchInterval: 12_000,
    ...queryPolicy,
  });
  return {
    activities: query.data?.data ?? [],
    source: query.data?.source,
    fallbackReason: query.data?.fallbackReason,
    refetch: query.refetch,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

export function useMyJobs() {
  const { address } = useAccount();
  const query = useQuery({
    queryKey: ['jobs', address?.toLowerCase() ?? 'disconnected'],
    queryFn: () => readService.listJobs({ account: address }),
    enabled: Boolean(address),
    refetchInterval: 12_000,
    ...queryPolicy,
  });
  return {
    jobs: query.data?.data ?? [],
    connected: Boolean(address),
    source: query.data?.source,
    fallbackReason: query.data?.fallbackReason,
    refetch: query.refetch,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

export function usePendingBalances() {
  const { address } = useAccount();
  const query = useQuery({
    queryKey: ['pending-balances', address],
    queryFn: () => readService.getPendingBalances(address!),
    enabled: Boolean(address),
    refetchInterval: 12_000,
    ...queryPolicy,
  });
  return {
    balances: query.data?.data ?? [],
    refetch: query.refetch,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

/** Compatibility helper for job-scoped balance banners. */
export function useWithdrawable(token?: Address) {
  const { balances, ...query } = usePendingBalances();
  const selected = token
    ? balances.find((balance) => balance.token.toLowerCase() === token.toLowerCase())
    : balances.find((balance) => balance.amount > 0n);
  return {
    ...query,
    balances,
    amount: selected?.amount ?? 0n,
    token: selected?.token ?? token ?? ETH_TOKEN,
  };
}

export function useRole(job?: Job): JobRole {
  const { address } = useAccount();
  return roleFor(job, address);
}

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
