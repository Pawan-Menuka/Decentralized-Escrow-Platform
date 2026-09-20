import { BaseError, ContractFunctionRevertedError, decodeErrorResult, type Hex } from 'viem';
import { ESCROW_ABI } from '../config/contract';

const FRIENDLY_ERRORS: Record<string, string> = {
  JobNotFound: 'This job does not exist.',
  MilestoneNotFound: 'This milestone does not exist.',
  NotClient: 'Only the client can perform this action.',
  NotFreelancer: 'Only the freelancer can perform this action.',
  NotArbitrator: 'Only the selected arbitrator can perform this action.',
  NotParticipant: 'Only the client or freelancer can perform this action.',
  InvalidJobState: 'The job is no longer in the required state.',
  InvalidMilestoneState: 'The milestone is no longer in the required state.',
  ZeroAddress: 'A required wallet address is missing.',
  SelfDealing: 'The client and freelancer must use different wallets.',
  InvalidArbitrator: 'The arbitrator must be a neutral third-party wallet.',
  NoMilestones: 'Add at least one milestone.',
  TooManyMilestones: 'A job can contain at most 50 milestones.',
  ZeroMilestoneAmount: 'Every milestone must have a positive amount.',
  ValueMismatch: 'The funding amount changed. Refresh the quote and try again.',
  TimelockOutOfRange: 'The review window must be between one hour and 90 days.',
  TimelockNotExpired: 'The review window has not expired yet.',
  NothingToWithdraw: 'There is no balance available to withdraw.',
  TokenAmountMismatch: 'The token transfer did not deliver the exact expected amount.',
  StalePrice: 'The Chainlink ETH/USD quote is stale. Try again after the feed updates.',
  InvalidPrice: 'Chainlink returned an invalid ETH/USD quote.',
  EnforcedPause: 'The escrow is temporarily paused.',
};

function decodedName(error: unknown): string | undefined {
  if (error instanceof BaseError) {
    const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName) return reverted.data.errorName;
  }
  const data = (error as { data?: unknown } | null)?.data;
  if (typeof data === 'string' && data.startsWith('0x')) {
    try { return decodeErrorResult({ abi: ESCROW_ABI, data: data as Hex }).errorName; }
    catch { return undefined; }
  }
  return undefined;
}

export function friendlyTransactionError(error: unknown): string {
  const name = decodedName(error);
  if (name && FRIENDLY_ERRORS[name]) return FRIENDLY_ERRORS[name];
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/rejected|denied|user refused/i.test(text)) return 'The wallet request was rejected. Nothing was submitted.';
  if (/insufficient funds/i.test(text)) return 'The wallet does not have enough funds for this transaction and gas.';
  return 'The transaction could not be completed. Check the current on-chain state and try again.';
}
