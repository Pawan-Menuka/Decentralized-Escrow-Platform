import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { USDC_ADDRESS } from '../config/contract';
import CreateJob from './CreateJob';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  approve: vi.fn(),
  resetWrite: vi.fn(),
  resetApproval: vi.fn(),
  refetchAllowance: vi.fn().mockResolvedValue({ data: 0n }),
  allowance: 0n,
  readContract: vi.fn(),
}));

vi.mock('../hooks/useEscrow', () => ({
  useEscrowWrite: () => ({ send: mocks.send, phase: 'idle', error: undefined, reset: mocks.resetWrite }),
  useUsdcApprove: () => ({ approve: mocks.approve, phase: 'idle', error: undefined, reset: mocks.resetApproval }),
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0x1000000000000000000000000000000000000001' }),
  usePublicClient: () => ({ readContract: mocks.readContract }),
  useReadContract: (request: { functionName: string }) => {
    const values: Record<string, unknown> = {
      MIN_TIMELOCK: 3600,
      MAX_TIMELOCK: 7_776_000,
      MAX_MILESTONES: 50,
      feeBps: 100,
      PRICE_STALENESS_THRESHOLD: 3600,
      decimals: 6,
      allowance: mocks.allowance,
      latestRoundData: [1n, 200_000_000_000n, 0n, BigInt(Math.floor(Date.now() / 1000)), 1n],
    };
    return { data: values[request.functionName], refetch: mocks.refetchAllowance };
  },
}));

const freelancer = '0x2000000000000000000000000000000000000002';
const arbitrator = '0x3000000000000000000000000000000000000003';

function startCreation(mode: 'ETH' | 'USD' | 'USDC', first: string, second: string): ReturnType<typeof render> {
  const result = render(<MemoryRouter><CreateJob /></MemoryRouter>);
  const addressInputs = screen.getAllByPlaceholderText('0x…');
  fireEvent.change(addressInputs[0], { target: { value: freelancer } });
  fireEvent.change(addressInputs[1], { target: { value: arbitrator } });
  fireEvent.click(screen.getByRole('button', { name: /Next: the money/ }));
  if (mode !== 'ETH') fireEvent.click(screen.getByRole('button', { name: new RegExp(mode === 'USD' ? 'USD → ETH' : 'USDC') }));
  fireEvent.change(screen.getByLabelText('Milestone 1 amount'), { target: { value: first } });
  fireEvent.change(screen.getByLabelText('Milestone 2 amount'), { target: { value: second } });
  fireEvent.click(screen.getByRole('button', { name: /Next: the rules/ }));
  fireEvent.click(screen.getByRole('button', { name: /Review everything/ }));
  return result;
}

describe('client job creation', () => {
  beforeEach(() => {
    mocks.send.mockReset();
    mocks.approve.mockReset();
    mocks.allowance = 0n;
    mocks.readContract.mockResolvedValue([1n, 200_000_000_000n, 0n, BigInt(Math.floor(Date.now() / 1000)), 1n]);
  });

  it('creates an ETH job with exact wei values', async () => {
    startCreation('ETH', '0.1', '0.200000000000000001');
    fireEvent.click(screen.getByRole('button', { name: /Fund 0.300000000000000001 ETH & create/ }));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledWith('createJob', [
      freelancer,
      arbitrator,
      '0x0000000000000000000000000000000000000000',
      [100000000000000000n, 200000000000000001n],
      604800n,
    ], 300000000000000001n));
  });

  it('refreshes the Chainlink quote before creating a USD-denominated job', async () => {
    startCreation('USD', '500', '250');
    fireEvent.click(screen.getByRole('button', { name: /Fund 0.375 ETH & create/ }));
    await waitFor(() => expect(mocks.readContract).toHaveBeenCalled());
    expect(mocks.send).toHaveBeenCalledWith('createJobUsd', [
      freelancer,
      arbitrator,
      [50_000_000_000n, 25_000_000_000n],
      604800n,
    ], 375000000000000000n);
  });

  it('requires the exact USDC approval before creation', async () => {
    const firstRender = startCreation('USDC', '5.25', '2');
    fireEvent.click(screen.getByRole('button', { name: /Approve 7.25 USDC/ }));
    expect(mocks.approve).toHaveBeenCalledWith(7_250_000n);
    expect(screen.getByRole('button', { name: /Create with 7.25 USDC/ })).toBeDisabled();

    firstRender.unmount();
    mocks.allowance = 7_250_000n;
    startCreation('USDC', '5.25', '2');
    const create = screen.getAllByRole('button', { name: /Create with 7.25 USDC/ }).at(-1)!;
    fireEvent.click(create);
    await waitFor(() => expect(mocks.send).toHaveBeenCalledWith('createJob', [freelancer, arbitrator, USDC_ADDRESS, [5_250_000n, 2_000_000n], 604800n], undefined));
  });
});
