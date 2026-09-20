import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import type { Address, Hash } from 'viem';
import { ESCROW_ABI, ESCROW_ADDRESS, ERC20_ABI, ETH_TOKEN, USDC_ADDRESS } from '../config/contract';
import { readService } from '../services/read';
import { roleFor } from '../domain/escrow';
import type { EscrowWriteArgs, Job, JobRole, TransactionPhase } from '../types';
import { friendlyTransactionError } from '../lib/transactions';

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
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [phase, setPhase] = useState<TransactionPhase>('idle');
  const [hash, setHash] = useState<Hash>();
  const [error, setError] = useState<string>();
  const reset = useCallback(() => { setPhase('idle'); setHash(undefined); setError(undefined); }, []);
  const send = async <Name extends keyof EscrowWriteArgs>(functionName: Name, args: EscrowWriteArgs[Name], value?: bigint) => {
    setError(undefined);
    if (!address || !publicClient) { setPhase('rejected'); setError('Connect a wallet on Sepolia first.'); return; }
    try {
      setPhase('simulating');
      const request = { ...escrow, account: address, functionName, args, ...(value !== undefined ? { value } : {}) } as Parameters<typeof publicClient.simulateContract>[0];
      const simulation = await publicClient.simulateContract(request);
      setPhase('wallet');
      const nextHash = await writeContractAsync(simulation.request as Parameters<typeof writeContractAsync>[0]);
      setHash(nextHash);
      setPhase('pending');
      let replaced = false;
      let equivalentReplacement = true;
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: nextHash,
        onReplaced: (replacement) => {
          replaced = true;
          equivalentReplacement = replacement.transaction.to === replacement.replacedTransaction.to && replacement.transaction.input === replacement.replacedTransaction.input;
          setHash(replacement.transaction.hash);
          setPhase('replaced');
        },
      });
      if (!equivalentReplacement) { setPhase('rejected'); setError('The pending transaction was replaced by a different wallet transaction. The requested action was not confirmed.'); return; }
      if (receipt.status !== 'success') { setPhase('reverted'); setError('The transaction reverted on-chain. No false success was recorded.'); return; }
      setPhase(replaced ? 'replaced' : 'success');
    } catch (caught) {
      const message = friendlyTransactionError(caught);
      setError(message);
      setPhase(/rejected|denied|refused/i.test(caught instanceof Error ? `${caught.name} ${caught.message}` : String(caught)) ? 'rejected' : 'reverted');
    }
  };
  return { send, phase, hash, error, reset };
}

export function useUsdcApprove() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [phase, setPhase] = useState<TransactionPhase>('idle');
  const [error, setError] = useState<string>();
  const approve = async (amount: bigint) => {
    setError(undefined);
    if (!address || !publicClient) { setPhase('rejected'); setError('Connect a wallet on Sepolia first.'); return; }
    try {
      setPhase('simulating');
      const request = await publicClient.simulateContract({ address: USDC_ADDRESS, abi: ERC20_ABI, account: address, functionName: 'approve', args: [ESCROW_ADDRESS, amount] });
      setPhase('wallet');
      const hash = await writeContractAsync(request.request);
      setPhase('pending');
      let equivalentReplacement = true;
      const receipt = await publicClient.waitForTransactionReceipt({ hash, onReplaced: (replacement) => {
        equivalentReplacement = replacement.transaction.to === replacement.replacedTransaction.to && replacement.transaction.input === replacement.replacedTransaction.input;
        setPhase('replaced');
      } });
      if (!equivalentReplacement) { setPhase('rejected'); setError('The approval was replaced by a different wallet transaction. No allowance was confirmed.'); return; }
      if (receipt.status !== 'success') throw new Error('Transaction reverted');
      setPhase('success');
    } catch (caught) {
      setError(friendlyTransactionError(caught));
      setPhase(/rejected|denied|refused/i.test(caught instanceof Error ? `${caught.name} ${caught.message}` : String(caught)) ? 'rejected' : 'reverted');
    }
  };
  return { approve, phase, error, reset: () => { setPhase('idle'); setError(undefined); } };
}
