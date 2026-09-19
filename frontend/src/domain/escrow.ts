import type { Address, Hash } from 'viem';
import type { Job, JobRole, JobState, Milestone, MilestoneState } from '../types';

type ContractJobState = JobState | 'NONE';

export const JOB_STATES = ['NONE', 'FUNDED', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED', 'CANCELLED'] as const;
export const MILESTONE_STATES = ['NONE', 'PENDING', 'SUBMITTED', 'APPROVED', 'DISPUTED', 'RESOLVED', 'AUTO_RELEASED'] as const;
export const JOB_STATE_LABEL: Record<JobState, string> = {
  FUNDED: 'Funded',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  DISPUTED: 'In dispute',
  CANCELLED: 'Cancelled',
};

export interface ContractJob {
  client: Address;
  freelancer: Address;
  arbitrator: Address;
  token: Address;
  totalAmount: bigint;
  timelock: number;
  createdAt: number;
  milestoneCount: number;
  state: number;
}

export interface ContractMilestone {
  amount: bigint;
  state: number;
  deliverableCid: string;
  submittedAt: number;
}

export interface JobDetails {
  job: Job;
  milestones: Milestone[];
}

export interface Activity {
  id: string;
  type: string;
  milestoneIndex: number | null;
  actor: Address | null;
  timestamp: number;
  txHash: Hash;
  data: string | null;
}

export interface TokenBalance {
  token: Address;
  amount: bigint;
}

export function adaptContractJob(id: number, raw: ContractJob): Job | null {
  const state = JOB_STATES[Number(raw.state)] as ContractJobState | undefined;
  if (!state || state === 'NONE') return null;
  return {
    id,
    client: raw.client,
    freelancer: raw.freelancer,
    arbitrator: raw.arbitrator,
    token: raw.token,
    total: raw.totalAmount,
    timelock: BigInt(raw.timelock),
    createdAt: BigInt(raw.createdAt),
    accepted: ['IN_PROGRESS', 'COMPLETED', 'DISPUTED'].includes(state),
    cancelled: state === 'CANCELLED',
    milestoneCount: Number(raw.milestoneCount),
    state,
  };
}

export function adaptContractMilestone(raw: ContractMilestone, index: number, cancelled = false): Milestone {
  const state = (cancelled ? 'CANCELLED' : MILESTONE_STATES[Number(raw.state)] ?? 'PENDING') as MilestoneState;
  return {
    index,
    amount: raw.amount,
    state,
    cid: raw.deliverableCid,
    submittedAt: Number(raw.submittedAt),
  };
}

export function belongsTo(job: Job, account: Address): boolean {
  const who = account.toLowerCase();
  return [job.client, job.freelancer, job.arbitrator].some((address) => address.toLowerCase() === who);
}

export function roleFor(job?: Job, account?: Address): JobRole {
  if (!job || !account) return 'observer';
  const who = account.toLowerCase();
  if (job.client.toLowerCase() === who) return 'client';
  if (job.freelancer.toLowerCase() === who) return 'freelancer';
  if (job.arbitrator.toLowerCase() === who) return 'arbitrator';
  return 'observer';
}
