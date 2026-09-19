import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { useMyJobs, useWithdrawable, useEscrowWrite } from '../hooks/useEscrow';
import { fmtAmount } from '../lib/format';
import { T, mono, ticket, STATE_COLOR } from '../theme';
import TxButton from '../components/TxButton';
import type { Job } from '../types';

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
          <span style={ticket(job.cancelled ? STATE_COLOR.CANCELLED : T.blue)}>{job.cancelled ? 'Cancelled' : 'In progress'}</span>
        </div>
      </div>
    </Link>
  );
}

export default function Jobs() {
  const { isConnected } = useAccount();
  const { jobs } = useMyJobs();
  // Balances are per-token on-chain; with no job context, surface whichever is non-zero.
  const { amount, token: wToken, refetch } = useWithdrawable();
  const w = useEscrowWrite();

  if (!isConnected) {
    return (
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ maxWidth: 520 }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 2, color: T.mut, marginBottom: 14 }}>HOW IT WORKS</div>
          <h1 style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 500, textWrap: 'pretty' }}>Get paid for the work. Pay for the work you got.</h1>
          <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.65, marginBottom: 22, textWrap: 'pretty' }}>
            The client funds the whole job up front. The money sits in a contract neither side controls, and pays out milestone by milestone. No company in the middle.
          </div>
          <div style={{ display: 'grid', gap: 10, marginBottom: 26 }}>
            {['The client escrows the full amount when creating the job.', 'The freelancer submits work milestone by milestone.', 'Approve, dispute, or let the 7-day timer pay it out — the contract keeps everyone honest.'].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <span style={{ fontFamily: mono, fontSize: 11, color: T.blue }}>{`0${i + 1}`}</span>
                <span style={{ fontSize: 13, color: T.body }}>{s}</span>
              </div>
            ))}
          </div>
          <span style={{ fontSize: 12, color: T.mut }}>Connect a wallet (top right) to see your jobs — or just browse, every job here is public.</span>
        </div>
      </main>
    );
  }

  return (
    <main style={{ flex: 1, maxWidth: 1060, width: '100%', margin: '0 auto', padding: '28px 24px 60px', boxSizing: 'border-box' }}>
      {amount > 0n && (
        <div style={{ border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.green}`, background: 'rgba(63,190,126,0.05)', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <span style={{ fontSize: 13 }}>You have <span style={{ fontFamily: mono, color: T.greenT }}>{fmtAmount(amount, wToken)}</span> ready to collect.</span>
          <div style={{ flex: 1 }} />
          <TxButton label="Withdraw it all" fn="withdraw()" kind="green" phase={w.phase}
            onClick={() => w.send('withdraw', [wToken])} onSuccess={() => { refetch(); w.reset(); }} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>Your jobs</h1>
        <span style={{ fontSize: 12, color: T.mut }}>{jobs.length} on this wallet</span>
        <div style={{ flex: 1 }} />
        <Link to="/create" style={{ fontSize: 13, fontWeight: 500, padding: '8px 16px', background: 'rgba(57,160,255,0.1)', border: `1px solid ${T.blue}`, color: T.blueT, borderRadius: 2 }}>+ Create a job</Link>
      </div>
      <div style={{ fontSize: 12, color: T.sub, marginBottom: 26 }}>Every job here is a contract holding real escrowed funds — nothing moves without a signature or a timer.</div>
      {jobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: T.dim, border: `1px dashed ${T.line}`, display: 'inline-block', padding: '14px 22px', marginBottom: 18 }}>no jobs on this wallet yet</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 500 }}>Nothing here — yet</h2>
          <div style={{ fontSize: 13, color: T.sub, marginBottom: 22 }}>Create a job to escrow funds for a freelancer, or ask a client to add your address to theirs.</div>
          <Link to="/create" style={{ display: 'inline-block', fontSize: 14, fontWeight: 500, padding: '11px 22px', background: 'rgba(57,160,255,0.1)', border: `1px solid ${T.blue}`, color: T.blueT, borderRadius: 2 }}>+ Create your first job</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {jobs.map((j) => <JobCard key={j.id} job={j} />)}
        </div>
      )}
    </main>
  );
}
