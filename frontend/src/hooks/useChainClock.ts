import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { sepolia } from 'viem/chains';

export const CHAIN_CLOCK_MAX_AGE_MS = 45_000;
const chainClockKey = ['chain-clock', sepolia.id] as const;
export interface BlockSample { timestamp: number; number: bigint; observedAt: number }

export function freshChainTimestamp(sample: BlockSample | undefined, monotonicNow: number, failed = false): number | undefined {
  if (!sample || failed || monotonicNow - sample.observedAt > CHAIN_CLOCK_MAX_AGE_MS || monotonicNow < sample.observedAt) return undefined;
  return sample.timestamp;
}

/** Only a fresh RPC block can establish expiry; device wall-clock time is never used. */
export function useChainClock() {
  const client = usePublicClient({ chainId: sepolia.id });
  const queryClient = useQueryClient();
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: chainClockKey,
    enabled: Boolean(client),
    queryFn: async () => {
      const block = await client!.getBlock({ blockTag: 'latest' });
      // Re-reading a stalled RPC's same block must not renew its freshness.
      // Preserve the observation across page remounts and shared consumers too.
      const previous = queryClient.getQueryData<BlockSample>(chainClockKey);
      const sample = previous?.number === block.number && previous.timestamp === Number(block.timestamp)
        ? previous
        : { number: block.number, timestamp: Number(block.timestamp), observedAt: performance.now() };
      return sample;
    },
    staleTime: 12_000,
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const timestamp = freshChainTimestamp(query.data, performance.now(), query.isError || !client);
  const status = timestamp !== undefined ? 'fresh' : query.isError || !client ? 'unavailable' : query.data ? 'stale' : 'loading';
  return { timestamp, status, refetch: query.refetch };
}
