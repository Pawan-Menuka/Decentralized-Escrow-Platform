import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JobActivity from './JobActivity';
import type { Activity } from '../domain/escrow';

vi.mock('../config/wagmi', () => ({ EXPLORER: 'https://sepolia.etherscan.io' }));
const activity: Activity = { id: 'dispute-1', type: 'DISPUTE_RAISED', milestoneIndex: 1, actor: '0x1000000000000000000000000000000000000001', timestamp: 1700000000, txHash: `0x${'1'.repeat(64)}`, data: 'bafy-evidence' };

describe('public job activity', () => {
  afterEach(cleanup);
  it('shows the milestone, transaction and safe evidence gateway links', () => {
    render(<JobActivity activities={[activity]} isLoading={false} onRefresh={vi.fn()} />);
    expect(screen.getByText('dispute raised · Milestone 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Transaction ↗' })).toHaveAttribute('href', `https://sepolia.etherscan.io/tx/${activity.txHash}`);
    expect(screen.getByRole('link', { name: 'Open evidence ↗' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'Open evidence ↗' }).getAttribute('href')).toContain('/ipfs/bafy-evidence');
  });
  it('renders rejection text as text rather than executable markup', () => {
    const { container } = render(<JobActivity activities={[{ ...activity, type: 'MILESTONE_REJECTED', data: '<script>alert(1)</script>' }]} isLoading={false} onRefresh={vi.fn()} />);
    expect(screen.getByText('Requested changes: <script>alert(1)</script>')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });
  it('distinguishes unavailable history from an empty timeline', () => {
    render(<JobActivity activities={[]} isLoading={false} unavailable="Indexer offline" onRefresh={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Indexer offline');
    expect(screen.queryByText('No indexed activity yet.')).not.toBeInTheDocument();
  });
});
