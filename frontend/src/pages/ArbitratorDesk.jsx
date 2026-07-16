import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { useMyJobs } from '../hooks/useEscrow';
import { T, mono } from '../theme';

// Arbitrator desk — lists jobs where the connected wallet is the arbitrator.
// Each dispute links into the JobDetail page, where the ruling panel lives.
// TODO: for the evidence side-by-side view, index DisputeRaised events
// (or query your subgraph) to fetch both parties' evidence CIDs per milestone.
export default function ArbitratorDesk() {
  const { address } = useAccount();
  const { jobs } = useMyJobs();
  const mine = jobs.filter((j) => j.arbitrator?.toLowerCase() === address?.toLowerCase());
  return (
    <main style={{ flex: 1, maxWidth: 1060, width: '100%', margin: '0 auto', padding: '28px 24px 60px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Your desk</h1>
        <span style={{ fontSize: 11, color: T.mut }}>arbitrator</span>
      </div>
      <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5, marginBottom: 20, maxWidth: 480, textWrap: 'pretty' }}>
        Two sides trusted you to be fair when they couldn&rsquo;t agree. Read both stories, then decide the split.
      </div>
      {!address ? (
        <div style={{ fontFamily: mono, fontSize: 11, color: T.dim, border: `1px dashed ${T.line}`, display: 'inline-block', padding: '14px 22px' }}>connect a wallet to see disputes assigned to you</div>
      ) : mine.length === 0 ? (
        <div style={{ fontFamily: mono, fontSize: 11, color: T.dim, border: `1px dashed ${T.line}`, display: 'inline-block', padding: '14px 22px' }}>no jobs name this wallet as arbitrator</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {mine.map((j) => (
            <Link key={j.id} to={`/jobs/${j.id}`} style={{ display: 'block', border: `1px solid ${T.line}`, background: T.panel, padding: '14px 18px', color: 'inherit' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>Job #{j.id}</span>
                <span style={{ fontFamily: mono, fontSize: 10, color: T.mut }}>open the job to see and rule on any dispute →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
