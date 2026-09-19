import type { Address, Hash } from 'viem';

export type MilestoneState =
  | 'PENDING'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'DISPUTED'
  | 'RESOLVED'
  | 'AUTO_RELEASED'
  | 'CANCELLED';

export type JobRole = 'client' | 'freelancer' | 'arbitrator' | 'observer';
export type JobState = 'FUNDED' | 'IN_PROGRESS' | 'COMPLETED' | 'DISPUTED' | 'CANCELLED';
export type TransactionPhase = 'idle' | 'wallet' | 'pending' | 'success';

export interface EscrowWriteArgs {
  createJob: readonly [Address, Address, Address, readonly bigint[], bigint];
  withdraw: readonly [Address];
  approveMilestone: readonly [bigint, bigint];
  rejectMilestone: readonly [bigint, bigint, string];
  claimTimelockRelease: readonly [bigint, bigint];
  submitMilestone: readonly [bigint, bigint, string];
  raiseDispute: readonly [bigint, bigint, string];
  resolveDispute: readonly [bigint, bigint, number];
}

export interface Job {
  id: number;
  client: Address;
  freelancer: Address;
  arbitrator: Address;
  token: Address;
  total: bigint;
  timelock: bigint;
  createdAt: bigint;
  accepted: boolean;
  cancelled: boolean;
  milestoneCount: number;
  state: JobState;
}

export interface Milestone {
  index: number;
  amount: bigint;
  state: MilestoneState;
  cid: string;
  submittedAt: number;
}

export interface EscrowWriteState {
  send: <Name extends keyof EscrowWriteArgs>(functionName: Name, args: EscrowWriteArgs[Name], value?: bigint) => void;
  phase: TransactionPhase;
  hash?: Hash;
  error: Error | null;
  reset: () => void;
}
