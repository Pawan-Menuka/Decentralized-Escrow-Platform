import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { useJobs, usePendingBalances, useEscrowWrite } from '../hooks/useEscrow';
import { fmtAmount } from '../lib/format';
import { T, mono, ticket, STATE_COLOR } from '../theme';
import TxButton from '../components/TxButton';
import type { Job } from '../types';
import { JOB_STATE_LABEL } from '../domain/escrow';

function JobCard({ job }: { job: Job & { id: number } }) {
  return (
    <Link to={`/jobs/${job.id}`} style={{ display: 'block', border: `1px solid ${T.line}`, background: T.panel, padding: '14px 18px', color: 'inherit' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 130px 170px', gap: 16, alignItems: 'center' }}>
        <span style={{ fontFamily: mono, fontSize: 12, color: T.mut }}>#{String(job.id).padStart(4, '0')}</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Job #{job.id}</div>
          <div style={{ fontSize: 12, color: T.sub, marginTop: 3 }}>
            {job.cancelled ? 'Cancelled — funds returned.' : job.accepted ? 'Work is ongoing.' : 'Waiting for the freelancer to accept.'}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontFamily: mono, fontSize: 13 }}>{fmtAmount(job.total, job.token)}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <span style={ticket(job.cancelled ? STATE_COLOR.CANCELLED : job.state === 'DISPUTED' ? T.red : job.state === 'COMPLETED' ? T.green : T.blue)}>{JOB_STATE_LABEL[job.state]}</span>
        </div>
      </div>
    </Link>
  );
}

export default function Jobs() {
  const { address, isConnected } = useAccount();
  const { jobs, source, fallbackReason, refetch, isLoading, isFetching, isStale, isError, error } = useJobs(address);
  const { balances, refetch: refetchBalances } = usePendingBalances();
  const w = useEscrowWrite();
  const withdrawable = balances.filter((balance) => balance.amount > 0n);

  return (
    <main style={{ flex: 1, maxWidth: 1060, width: '100%', margin: '0 auto', padding: '28px 24px 60px', boxSizing: 'border-box' }}>
      {withdrawable.map((balance) => (
        <div key={balance.token} style={{ border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.green}`, background: 'rgba(63,190,126,0.05)', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
          <span style={{ fontSize: 13 }}>You have <span style={{ fontFamily: mono, color: T.greenT }}>{fmtAmount(balance.amount, balance.token)}</span> ready to collect.</span>
          <div style={{ flex: 1 }} />
          <TxButton label={`Withdraw ${fmtAmount(balance.amount, balance.token)}`} fn="withdraw(token)" kind="green" phase={w.phase}
            onClick={() => w.send('withdraw', [balance.token])} onSuccess={() => { void refetchBalances(); w.reset(); }} />
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>{isConnected ? 'Your jobs' : 'Public jobs'}</h1>
        <span style={{ fontSize: 12, color: T.mut }}>{isLoading ? 'loading…' : `${jobs.length} ${isConnected ? 'on this wallet' : 'indexed on Sepolia'}`}</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => void refetch()} disabled={isFetching} style={{ border: `1px solid ${T.line}`, background: 'transparent', color: T.sub, padding: '8px 12px', cursor: 'pointer' }}>{isFetching ? 'Refreshing…' : 'Refresh'}</button>
        {isConnected && <Link to="/create" style={{ fontSize: 13, fontWeight: 500, padding: '8px 16px', background: 'rgba(57,160,255,0.1)', border: `1px solid ${T.blue}`, color: T.blueT, borderRadius: 2 }}>+ Create a job</Link>}
      </div>
      <div style={{ fontSize: 12, color: T.sub, marginBottom: 8 }}>Every job here is backed by Sepolia contract data. {source && <>Source: {source === 'subgraph' ? 'The Graph' : 'direct RPC'}.</>}</div>
      {(fallbackReason || isStale) && <div style={{ fontSize: 11, color: T.amber, marginBottom: 18 }}>{fallbackReason ? `RPC fallback active: ${fallbackReason}` : 'This list may be stale; refresh to request current data.'}</div>}
      {isError ? (
        <div role="alert" style={{ border: `1px solid ${T.red}`, padding: 18, color: T.red }}>Could not load jobs: {error instanceof Error ? error.message : 'Unknown read error.'}</div>
      ) : !isLoading && jobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: T.dim, border: `1px dashed ${T.line}`, display: 'inline-block', padding: '14px 22px', marginBottom: 18 }}>no matching jobs found</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 500 }}>Nothing here — yet</h2>
          <div style={{ fontSize: 13, color: T.sub, marginBottom: 22 }}>{isConnected ? 'Create a job, or ask a client to add your wallet to theirs.' : 'Connect a wallet to create a Sepolia escrow job.'}</div>
          {isConnected && <Link to="/create" style={{ display: 'inline-block', fontSize: 14, fontWeight: 500, padding: '11px 22px', background: 'rgba(57,160,255,0.1)', border: `1px solid ${T.blue}`, color: T.blueT, borderRadius: 2 }}>+ Create your first job</Link>}
        </div>
      ) : !isLoading && (
        <div style={{ display: 'grid', gap: 10 }}>
          {jobs.map((j) => <JobCard key={j.id} job={j} />)}
        </div>
      )}
    </main>
  );
}
