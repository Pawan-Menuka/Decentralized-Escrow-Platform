import { describe, expect, it } from 'vitest';
import { encodeErrorResult } from 'viem';
import { ESCROW_ABI } from '../config/contract';
import { friendlyTransactionError } from './transactions';

describe('transaction error messages', () => {
  it('decodes known escrow custom errors', () => {
    const data = encodeErrorResult({ abi: ESCROW_ABI, errorName: 'StalePrice' });
    expect(friendlyTransactionError({ data })).toContain('Chainlink');
  });

  it('distinguishes wallet rejection from a contract failure', () => {
    expect(friendlyTransactionError(new Error('User rejected the request'))).toContain('wallet request was rejected');
    expect(friendlyTransactionError(new Error('unknown RPC problem'))).toContain('could not be completed');
  });
});
