import type { Address, Hash } from 'viem';
import { env } from '../../config/env';
import type { Activity } from '../../domain/escrow';
import type { Job, JobState } from '../../types';
import type { JobDiscoveryService, JobListOptions } from './types';

interface GraphError { message: string }
interface GraphEnvelope<T> { data?: T; errors?: GraphError[] }
interface GraphJob {
  id: string; jobId: string; client: Address; freelancer: Address; arbitrator: Address;
  token: Address; totalAmount: string; milestoneCount: string; timelock: string;
  state: JobState; createdAt: string;
}
interface GraphActivity {
  id: string; type: string; milestoneIndex: string | null; actor: Address | null;
  timestamp: string; txHash: Hash; data: string | null;
}

const JOB_FIELDS = `id jobId client freelancer arbitrator token totalAmount milestoneCount timelock state createdAt`;

async function gql<T>(query: string, variables: Record<string, string> = {}): Promise<T> {
  if (!env.subgraphUrl) throw new Error('The subgraph URL is not configured.');
  const response = await fetch(env.subgraphUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`Subgraph HTTP ${response.status}`);
  const payload = await response.json() as GraphEnvelope<T>;
  if (payload.errors?.length) throw new Error(payload.errors[0].message);
  if (!payload.data) throw new Error('The subgraph returned no data.');
  return payload.data;
}

function adaptJob(job: GraphJob): Job {
  return {
    id: Number(job.jobId),
    client: job.client,
    freelancer: job.freelancer,
    arbitrator: job.arbitrator,
    token: job.token,
    total: BigInt(job.totalAmount),
    timelock: BigInt(job.timelock),
    createdAt: BigInt(job.createdAt),
    accepted: ['IN_PROGRESS', 'COMPLETED', 'DISPUTED'].includes(job.state),
    cancelled: job.state === 'CANCELLED',
    milestoneCount: Number(job.milestoneCount),
    state: job.state,
  };
}

export class GraphReadService implements JobDiscoveryService {
  async listJobs(options: JobListOptions = {}): Promise<Job[]> {
    if (!options.account) {
      const result = await gql<{ jobs: GraphJob[] }>(`query PublicJobs { jobs(orderBy: createdAt, orderDirection: desc, first: 100) { ${JOB_FIELDS} } }`);
      return result.jobs.map(adaptJob);
    }
    const result = await gql<{ asClient: GraphJob[]; asFreelancer: GraphJob[]; asArbitrator: GraphJob[] }>(
      `query JobsFor($who: Bytes!) {
        asClient: jobs(where: { client: $who }, orderBy: createdAt, orderDirection: desc, first: 100) { ${JOB_FIELDS} }
        asFreelancer: jobs(where: { freelancer: $who }, orderBy: createdAt, orderDirection: desc, first: 100) { ${JOB_FIELDS} }
        asArbitrator: jobs(where: { arbitrator: $who }, orderBy: createdAt, orderDirection: desc, first: 100) { ${JOB_FIELDS} }
      }`,
      { who: options.account.toLowerCase() },
    );
    const jobs = new Map<number, Job>();
    [...result.asClient, ...result.asFreelancer, ...result.asArbitrator]
      .map(adaptJob)
      .forEach((job) => jobs.set(job.id, job));
    return [...jobs.values()].sort((a, b) => b.id - a.id);
  }

  async getActivities(jobId: number): Promise<Activity[]> {
    const result = await gql<{ activities: GraphActivity[] }>(
      `query Activities($job: String!) {
        activities(where: { job: $job }, orderBy: timestamp, orderDirection: asc, first: 200) {
          id type milestoneIndex actor timestamp txHash data
        }
      }`,
      { job: String(jobId) },
    );
    return result.activities.map((activity) => ({
      ...activity,
      milestoneIndex: activity.milestoneIndex === null ? null : Number(activity.milestoneIndex),
      timestamp: Number(activity.timestamp),
    }));
  }
}
