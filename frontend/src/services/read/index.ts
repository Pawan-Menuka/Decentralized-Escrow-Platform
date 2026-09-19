import { env } from '../../config/env';
import { GraphReadService } from './graph';
import { RpcReadService } from './rpc';
import type { AuthoritativeReadService, JobDiscoveryService, ReadService, ReadResult } from './types';

const result = <T>(data: T, source: 'subgraph' | 'rpc', fallbackReason?: string): ReadResult<T> => ({
  data, source, fallbackReason, fetchedAt: Date.now(),
});

export function createReadService(
  graph: JobDiscoveryService,
  rpc: AuthoritativeReadService,
  subgraphEnabled: boolean,
): ReadService {
  return {
    async listJobs(options = {}) {
      if (subgraphEnabled) {
        try {
          return result(await graph.listJobs(options), 'subgraph');
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Subgraph query failed.';
          return result(await rpc.listJobs(options), 'rpc', reason);
        }
      }
      return result(await rpc.listJobs(options), 'rpc', 'Subgraph is not configured.');
    },
    async getJob(jobId) {
      return result(await rpc.getJob(jobId), 'rpc');
    },
    async getActivities(jobId) {
      if (!subgraphEnabled) return result([], 'rpc', 'Activity history requires the subgraph.');
      try {
        return result(await graph.getActivities(jobId), 'subgraph');
      } catch (error) {
        return result([], 'rpc', error instanceof Error ? error.message : 'Subgraph query failed.');
      }
    },
    async getPendingBalances(account) {
      return result(await rpc.getPendingBalances(account), 'rpc');
    },
  };
}

export const readService = createReadService(new GraphReadService(), new RpcReadService(), Boolean(env.subgraphUrl));
export type { ReadResult, ReadSource } from './types';
