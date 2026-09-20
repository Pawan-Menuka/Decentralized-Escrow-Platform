import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  simulateContract: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  writeContractAsync: vi.fn(),
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0x1000000000000000000000000000000000000001' }),
  usePublicClient: () => ({ simulateContract: mocks.simulateContract, waitForTransactionReceipt: mocks.waitForTransactionReceipt }),
  useWriteContract: () => ({ writeContractAsync: mocks.writeContractAsync }),
}));

import { useEscrowWrite } from './useEscrow';

const hash = `0x${'1'.repeat(64)}` as const;
const request = { to: '0x85DBE339432cd7960FADFef78e2E6981025bD4BA', input: '0x1234' };

describe('simulated transaction lifecycle', () => {
  beforeEach(() => {
    mocks.simulateContract.mockReset().mockResolvedValue({ request });
    mocks.writeContractAsync.mockReset().mockResolvedValue(hash);
    mocks.waitForTransactionReceipt.mockReset().mockResolvedValue({ status: 'success' });
  });

  it('simulates before writing and reports success only after a successful receipt', async () => {
    const { result } = renderHook(() => useEscrowWrite());
    await act(async () => { await result.current.send('cancelJob', [1n]); });
    expect(mocks.simulateContract.mock.invocationCallOrder[0]).toBeLessThan(mocks.writeContractAsync.mock.invocationCallOrder[0]);
    expect(mocks.writeContractAsync.mock.invocationCallOrder[0]).toBeLessThan(mocks.waitForTransactionReceipt.mock.invocationCallOrder[0]);
    expect(result.current.phase).toBe('success');
    expect(result.current.error).toBeUndefined();
  });

  it('keeps wallet rejection out of the success state and permits retry', async () => {
    mocks.writeContractAsync.mockRejectedValueOnce(new Error('User rejected the request'));
    const { result } = renderHook(() => useEscrowWrite());
    await act(async () => { await result.current.send('cancelJob', [1n]); });
    expect(result.current.phase).toBe('rejected');
    expect(result.current.error).toContain('wallet request was rejected');

    await act(async () => { await result.current.send('cancelJob', [1n]); });
    expect(result.current.phase).toBe('success');
  });

  it('does not treat a different nonce-replacement transaction as success', async () => {
    mocks.waitForTransactionReceipt.mockImplementationOnce(async ({ onReplaced }: { onReplaced: (replacement: unknown) => void }) => {
      onReplaced({
        transaction: { hash: `0x${'2'.repeat(64)}`, to: request.to, input: '0xabcd' },
        replacedTransaction: { to: request.to, input: request.input },
      });
      return { status: 'success' };
    });
    const { result } = renderHook(() => useEscrowWrite());
    await act(async () => { await result.current.send('cancelJob', [1n]); });
    expect(result.current.phase).toBe('rejected');
    expect(result.current.error).toContain('replaced by a different wallet transaction');
  });

  it('reports an on-chain failed receipt as reverted', async () => {
    mocks.waitForTransactionReceipt.mockResolvedValueOnce({ status: 'reverted' });
    const { result } = renderHook(() => useEscrowWrite());
    await act(async () => { await result.current.send('cancelJob', [1n]); });
    expect(result.current.phase).toBe('reverted');
    expect(result.current.error).toContain('reverted on-chain');
  });
});
