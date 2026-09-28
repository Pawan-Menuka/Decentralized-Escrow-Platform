import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobDetail from './JobDetail';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  reset: vi.fn(),
  refetch: vi.fn(),
  refetchBalance: vi.fn(),
  role: 'freelancer',
  feeBps: 250 as number | undefined,
  state: 'PENDING',
  accepted: false,
  phase: 'idle',
  chainTimestamp: 1 as number | undefined,
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0x2000000000000000000000000000000000000002' }),
  useSignMessage: () => ({ signMessageAsync: vi.fn() }),
  useReadContract: () => ({ data: mocks.feeBps }),
}));

vi.mock('../config/wagmi', () => ({ EXPLORER: 'https://sepolia.etherscan.io' }));
vi.mock('../hooks/useChainClock', () => ({ useChainClock: () => ({ timestamp: mocks.chainTimestamp, status: mocks.chainTimestamp === undefined ? 'stale' : 'fresh', refetch: mocks.refetch }) }));

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
      accepted: mocks.accepted,
      cancelled: false,
      milestoneCount: 1,
      state: 'FUNDED',
    },
    milestones: [{ index: 0, amount: 100000000000000n, state: mocks.state, cid: '', submittedAt: 0 }],
    refetch: mocks.refetch,
    isLoading: false,
    isFetching: false,
    isStale: false,
    isError: false,
    error: undefined,
    source: 'rpc',
  }),
  useRole: () => mocks.role,
  useEscrowWrite: () => ({ send: mocks.send, phase: mocks.phase, error: undefined, reset: mocks.reset }),
  useWithdrawable: () => ({ amount: 0n, refetch: mocks.refetchBalance }),
  useActivities: () => ({ activities: [], refetch: mocks.refetch, isLoading: false, isError: false }),
}));

describe('freelancer job acceptance', () => {
  afterEach(cleanup);
  beforeEach(() => { mocks.send.mockReset(); mocks.refetch.mockReset(); mocks.role = 'freelancer'; mocks.state = 'PENDING'; mocks.accepted = false; mocks.phase = 'idle'; mocks.feeBps = 250; mocks.chainTimestamp = 1; });

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

  it('previews exact arbitrary basis-point splits using the live fee and submits those basis points', () => {
    mocks.role = 'arbitrator'; mocks.state = 'DISPUTED'; mocks.accepted = true;
    render(<MemoryRouter initialEntries={['/jobs/2']}><Routes><Route path="/jobs/:jobId" element={<JobDetail />} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Decide the split/ }));
    fireEvent.change(screen.getByRole('slider', { name: 'Freelancer share in basis points' }), { target: { value: '3333' } });
    expect(screen.getByText('0.00003249675 ETH')).toBeInTheDocument();
    expect(screen.getByText('0.00006667 ETH')).toBeInTheDocument();
    expect(screen.getByText(/Protocol fee: 0.00000083325 ETH/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Make it final/ }));
    expect(mocks.send).toHaveBeenCalledWith('resolveDispute', [2n, 0n, 3333]);
  });

  it('does not invent a fee estimate or enable a ruling while the fee is unavailable', () => {
    mocks.role = 'arbitrator'; mocks.state = 'DISPUTED'; mocks.accepted = true; mocks.feeBps = undefined;
    render(<MemoryRouter initialEntries={['/jobs/2']}><Routes><Route path="/jobs/:jobId" element={<JobDetail />} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Decide the split/ }));
    expect(screen.getByRole('button', { name: /Make it final/ })).toBeDisabled();
  });

  it('labels approval honestly when the current fee cannot be read', () => {
    mocks.role = 'client'; mocks.state = 'SUBMITTED'; mocks.accepted = true; mocks.feeBps = undefined;
    render(<MemoryRouter initialEntries={['/jobs/2']}><Routes><Route path="/jobs/:jobId" element={<JobDetail />} /></Routes></MemoryRouter>);
    const approval = screen.getByRole('button', { name: /Approve milestone — payout estimate unavailable/ });
    expect(approval).not.toHaveTextContent('0.0001 ETH');
    fireEvent.click(approval);
    expect(mocks.send).toHaveBeenCalledWith('approveMilestone', [2n, 0n]);
  });

  it('offers manual release only when a fresh block confirms the exact deadline', () => {
    mocks.role = 'observer'; mocks.state = 'SUBMITTED'; mocks.accepted = true;
    const view = () => <MemoryRouter initialEntries={['/jobs/2']}><Routes><Route path="/jobs/:jobId" element={<JobDetail />} /></Routes></MemoryRouter>;
    mocks.chainTimestamp = 259199;
    const { rerender } = render(view());
    expect(screen.queryByRole('button', { name: /Trigger the payout/ })).not.toBeInTheDocument();
    mocks.chainTimestamp = 259200;
    rerender(view());
    expect(screen.getByRole('button', { name: /Trigger the payout/ })).toBeInTheDocument();
    mocks.chainTimestamp = undefined;
    rerender(view());
    expect(screen.queryByRole('button', { name: /Trigger the payout/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Sepolia clock stale/)).toBeInTheDocument();
  });

  it('refreshes contract state and closes the upload form after confirmed submission', () => {
    mocks.accepted = true;
    const view = <MemoryRouter initialEntries={['/jobs/2']}><Routes><Route path="/jobs/:jobId" element={<JobDetail />} /></Routes></MemoryRouter>;
    const { rerender } = render(view);
    fireEvent.click(screen.getByRole('button', { name: /Submit your work/ }));
    expect(screen.getByRole('button', { name: /Submit it/ })).toBeInTheDocument();
    mocks.phase = 'success';
    rerender(<MemoryRouter initialEntries={['/jobs/2']}><Routes><Route path="/jobs/:jobId" element={<JobDetail />} /></Routes></MemoryRouter>);
    expect(mocks.refetch).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Submit it/ })).not.toBeInTheDocument();
  });
});
