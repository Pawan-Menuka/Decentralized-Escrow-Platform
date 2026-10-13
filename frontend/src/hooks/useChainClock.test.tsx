import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshChainTimestamp, useChainClock } from './useChainClock';

const mocks = vi.hoisted(() => ({ getBlock: vi.fn() }));
vi.mock('wagmi', () => ({ usePublicClient: () => ({ getBlock: mocks.getBlock }) }));

describe('Sepolia block clock', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('ignores a device wall clock far ahead or behind', () => {
    const sample = { timestamp: 160, number: 10n, observedAt: 1000 };
    vi.spyOn(Date, 'now').mockReturnValue(9_999_999_999_999);
    expect(freshChainTimestamp(sample, 2000)).toBe(160);
    vi.mocked(Date.now).mockReturnValue(0);
    expect(freshChainTimestamp(sample, 2000)).toBe(160);
  });

  it('rejects missing, old, failed or invalid monotonic samples', () => {
    const sample = { timestamp: 160, number: 10n, observedAt: 1000 };
    expect(freshChainTimestamp(undefined, 1000)).toBeUndefined();
    expect(freshChainTimestamp(sample, 46_001)).toBeUndefined();
    expect(freshChainTimestamp(sample, 2000, true)).toBeUndefined();
    expect(freshChainTimestamp(sample, 999)).toBeUndefined();
  });

  it('keeps stalled blocks stale across remounts and recovers when a new block arrives', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    mocks.getBlock.mockResolvedValue({ number: 10n, timestamp: 160n });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender, unmount } = renderHook(() => useChainClock(), { wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children) });
    await waitFor(() => expect(result.current.timestamp).toBe(160));
    expect(mocks.getBlock).toHaveBeenCalledWith({ blockTag: 'latest' });
    now = 46_001;
    await act(async () => { await result.current.refetch(); });
    rerender();
    expect(result.current.status).toBe('stale');
    expect(result.current.timestamp).toBeUndefined();
    unmount();
    const remounted = renderHook(() => useChainClock(), { wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children) });
    await act(async () => { await remounted.result.current.refetch(); });
    remounted.rerender();
    expect(remounted.result.current.status).toBe('stale');
    expect(remounted.result.current.timestamp).toBeUndefined();
    mocks.getBlock.mockResolvedValue({ number: 11n, timestamp: 172n });
    await act(async () => { await remounted.result.current.refetch(); });
    await waitFor(() => expect(remounted.result.current.timestamp).toBe(172));
    client.clear();
  });
});
