import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArbitratorDesk from './ArbitratorDesk';

const mocks = vi.hoisted(() => ({ loading: false, error: false, address: '0x1000000000000000000000000000000000000001', refresh: vi.fn() }));
vi.mock('wagmi', () => ({ useAccount: () => ({ address: mocks.address }) }));
vi.mock('../hooks/useEscrow', () => ({ useMyJobs: () => ({
  jobs: [{ id: 1, arbitrator: mocks.address, state: 'DISPUTED' }, { id: 2, arbitrator: mocks.address, state: 'COMPLETED' }, { id: 3, arbitrator: '0xother', state: 'DISPUTED' }],
  isLoading: mocks.loading, isError: mocks.error, error: new Error('RPC offline'), refetch: mocks.refresh,
}) }));

describe('arbitrator desk', () => {
  afterEach(cleanup);
  beforeEach(() => { mocks.loading = false; mocks.error = false; });
  it('filters unresolved disputes to the snapshotted arbitrator and allows all assigned jobs', () => {
    render(<MemoryRouter><ArbitratorDesk /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Job #1/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Job #2/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Job #3/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('link', { name: /Job #2/ })).toBeInTheDocument();
  });
  it('shows loading before declaring the desk empty', () => {
    mocks.loading = true;
    render(<MemoryRouter><ArbitratorDesk /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading assigned disputes');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  it('shows read failures with a refresh action', () => {
    mocks.error = true;
    render(<MemoryRouter><ArbitratorDesk /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent('RPC offline');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh desk' }));
    expect(mocks.refresh).toHaveBeenCalled();
  });
});
