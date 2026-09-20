import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JobDetail from './JobDetail';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  reset: vi.fn(),
  refetch: vi.fn(),
  refetchBalance: vi.fn(),
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0x2000000000000000000000000000000000000002' }),
  useSignMessage: () => ({ signMessageAsync: vi.fn() }),
}));

vi.mock('../config/wagmi', () => ({ EXPLORER: 'https://sepolia.etherscan.io' }));

vi.mock('../hooks/useEscrow', () => ({
  useJob: () => ({
    job: {
      id: 2,
      client: '0x1000000000000000000000000000000000000001',
      freelancer: '0x2000000000000000000000000000000000000002',
      arbitrator: '0x3000000000000000000000000000000000000003',
      token: '0x0000000000000000000000000000000000000000',
      total: 100000000000000n,
      timelock: 259200n,
      createdAt: 1n,
      accepted: false,
      cancelled: false,
      milestoneCount: 1,
      state: 'FUNDED',
    },
    milestones: [{ index: 0, amount: 100000000000000n, state: 'PENDING', cid: '', submittedAt: 0 }],
    refetch: mocks.refetch,
    isLoading: false,
    isFetching: false,
    isStale: false,
    isError: false,
    error: undefined,
    source: 'rpc',
  }),
  useRole: () => 'freelancer',
  useEscrowWrite: () => ({ send: mocks.send, phase: 'idle', error: undefined, reset: mocks.reset }),
  useWithdrawable: () => ({ amount: 0n, refetch: mocks.refetchBalance }),
}));

describe('freelancer job acceptance', () => {
  beforeEach(() => mocks.send.mockReset());

  it('shows the funded job as awaiting acceptance and sends acceptJob', () => {
    render(
      <MemoryRouter initialEntries={['/jobs/2']}>
        <Routes><Route path="/jobs/:jobId" element={<JobDetail />} /></Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Awaiting acceptance')).toBeInTheDocument();
    expect(screen.getByText('Accept this funded job before starting work.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Accept job/ }));
    expect(mocks.send).toHaveBeenCalledWith('acceptJob', [2n]);
  });
});
