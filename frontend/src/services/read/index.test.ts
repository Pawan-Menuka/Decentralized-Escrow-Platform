import { describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';
import { createReadService } from '.';
import type { AuthoritativeReadService, JobDiscoveryService } from './types';

const account = '0x1111111111111111111111111111111111111111' as Address;
const rpc: AuthoritativeReadService = {
  listJobs: vi.fn().mockResolvedValue([]),
  getJob: vi.fn(),
  getPendingBalances: vi.fn().mockResolvedValue([]),
};

describe('composite read service', () => {
  it('falls back to RPC when a configured subgraph fails', async () => {
    const graph: JobDiscoveryService = {
      listJobs: vi.fn().mockRejectedValue(new Error('indexer unavailable')),
      getActivities: vi.fn().mockResolvedValue([]),
    };
    const response = await createReadService(graph, rpc, true).listJobs({ account });
    expect(response.source).toBe('rpc');
    expect(response.fallbackReason).toBe('indexer unavailable');
    expect(rpc.listJobs).toHaveBeenCalledWith({ account });
  });

  it('uses RPC directly when no subgraph URL is configured', async () => {
    const graph: JobDiscoveryService = {
      listJobs: vi.fn(),
      getActivities: vi.fn(),
    };
    const response = await createReadService(graph, rpc, false).listJobs();
    expect(response.source).toBe('rpc');
    expect(graph.listJobs).not.toHaveBeenCalled();
  });
});
