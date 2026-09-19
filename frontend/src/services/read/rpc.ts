import { createPublicClient, http, type Address } from 'viem';
import { sepolia } from 'viem/chains';
import { freelanceEscrowAbi } from '../../abi/FreelanceEscrow';
import { env } from '../../config/env';
import { ESCROW_ADDRESS, ETH_TOKEN, USDC_ADDRESS } from '../../config/contract';
import { adaptContractJob, adaptContractMilestone, belongsTo, type ContractJob, type ContractMilestone, type JobDetails, type TokenBalance } from '../../domain/escrow';
import type { Job } from '../../types';
import type { AuthoritativeReadService, JobListOptions } from './types';

const client = createPublicClient({ chain: sepolia, transport: http(env.sepoliaRpcUrl) });
const contract = { address: ESCROW_ADDRESS, abi: freelanceEscrowAbi } as const;

function validJobId(jobId: number): bigint {
  if (!Number.isSafeInteger(jobId) || jobId < 1) throw new Error('Job IDs start at 1.');
  return BigInt(jobId);
}

export class RpcReadService implements AuthoritativeReadService {
  async listJobs(options: JobListOptions = {}): Promise<Job[]> {
    const count = Number(await client.readContract({ ...contract, functionName: 'jobCounter' }));
    if (count === 0) return [];
    const results = await client.multicall({
      allowFailure: true,
      contracts: Array.from({ length: count }, (_, index) => ({
        ...contract,
        functionName: 'getJob' as const,
        args: [BigInt(index + 1)] as const,
      })),
    });
    const jobs = results.flatMap((result, index) => {
      if (result.status !== 'success') return [];
      const job = adaptContractJob(index + 1, result.result as ContractJob);
      return job ? [job] : [];
    });
    return (options.account ? jobs.filter((job) => belongsTo(job, options.account!)) : jobs)
      .sort((a, b) => b.id - a.id);
  }

  async getJob(jobId: number): Promise<JobDetails> {
    const id = validJobId(jobId);
    const [rawJob, rawMilestones] = await Promise.all([
      client.readContract({ ...contract, functionName: 'getJob', args: [id] }),
      client.readContract({ ...contract, functionName: 'getMilestones', args: [id] }),
    ]);
    const job = adaptContractJob(jobId, rawJob as ContractJob);
    if (!job) throw new Error(`Job #${jobId} does not exist.`);
    const milestones = (rawMilestones as readonly ContractMilestone[])
      .map((milestone, index) => adaptContractMilestone(milestone, index, job.cancelled));
    return { job, milestones };
  }

  async getPendingBalances(account: Address): Promise<TokenBalance[]> {
    const [eth, usdc] = await client.multicall({
      allowFailure: false,
      contracts: [ETH_TOKEN, USDC_ADDRESS].map((token) => ({
        ...contract,
        functionName: 'pendingWithdrawals' as const,
        args: [token, account] as const,
      })),
    });
    return [
      { token: ETH_TOKEN, amount: eth },
      { token: USDC_ADDRESS, amount: usdc },
    ];
  }
}
