import type { Address } from 'viem';
import type { Activity, JobDetails, TokenBalance } from '../../domain/escrow';
import type { Job } from '../../types';

export type ReadSource = 'subgraph' | 'rpc';

export interface JobListOptions {
  account?: Address;
}

export interface ReadResult<T> {
  data: T;
  source: ReadSource;
  fetchedAt: number;
  fallbackReason?: string;
}

export interface ReadService {
  listJobs(options?: JobListOptions): Promise<ReadResult<Job[]>>;
  getJob(jobId: number): Promise<ReadResult<JobDetails>>;
  getActivities(jobId: number): Promise<ReadResult<Activity[]>>;
  getPendingBalances(account: Address): Promise<ReadResult<TokenBalance[]>>;
}

export interface JobDiscoveryService {
  listJobs(options?: JobListOptions): Promise<Job[]>;
  getActivities(jobId: number): Promise<Activity[]>;
}

export interface AuthoritativeReadService {
  listJobs(options?: JobListOptions): Promise<Job[]>;
  getJob(jobId: number): Promise<JobDetails>;
  getPendingBalances(account: Address): Promise<TokenBalance[]>;
}
