import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import { adaptContractJob, adaptContractMilestone, belongsTo, roleFor } from './escrow';

const client = '0x1111111111111111111111111111111111111111' as Address;
const freelancer = '0x2222222222222222222222222222222222222222' as Address;
const arbitrator = '0x3333333333333333333333333333333333333333' as Address;
const token = '0x0000000000000000000000000000000000000000' as Address;

describe('escrow domain adapters', () => {
  const job = adaptContractJob(1, {
    client, freelancer, arbitrator, token, totalAmount: 10_000n,
    timelock: 604800, createdAt: 123, milestoneCount: 2, state: 2,
  });

  it('maps contract structs to a stable UI model', () => {
    expect(job).toMatchObject({ id: 1, state: 'IN_PROGRESS', accepted: true, cancelled: false, createdAt: 123n });
  });

  it('derives roles from authoritative job addresses', () => {
    expect(roleFor(job!, client)).toBe('client');
    expect(roleFor(job!, freelancer)).toBe('freelancer');
    expect(roleFor(job!, arbitrator)).toBe('arbitrator');
    expect(belongsTo(job!, client)).toBe(true);
  });

  it('maps milestone state and cancellation without exposing raw tuples', () => {
    const raw = { amount: 5_000n, state: 2, deliverableCid: 'bafy-test', submittedAt: 456 };
    expect(adaptContractMilestone(raw, 0)).toMatchObject({ index: 0, state: 'SUBMITTED', submittedAt: 456 });
    expect(adaptContractMilestone(raw, 0, true).state).toBe('CANCELLED');
  });
});
