import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { T, mono } from '../theme';

const S = { maxWidth: 1060, margin: '0 auto', padding: '0 24px', boxSizing: 'border-box' };

export default function Landing() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const remain = Math.max(0, 223773 - Math.floor((now % 604800000) / 1000) % 223773 + 180000); // illustrative ticker
  const d = Math.floor(remain / 86400), h = Math.floor((remain % 86400) / 3600), m = Math.floor((remain % 3600) / 60), s = remain % 60;
  const p = (n) => String(n).padStart(2, '0');
  const promises = [
    { tag: 'FOR FREELANCERS', color: T.blue, head: 'The money exists before you start.', body: 'You can see the full amount sitting in the contract before you write a line. A silent client can\u2019t stall you — after 7 days, submitted work pays out on its own.' },
    { tag: 'FOR CLIENTS', color: T.green, head: 'Nothing pays out until you say so.', body: 'Money moves only when you approve a milestone — or when you\u2019ve had a full week to object and didn\u2019t. Bad work? Send it back with a note, or dispute it.' },
    { tag: 'WHEN YOU DISAGREE', color: T.violet, head: 'A human you both chose decides.', body: 'Disputes freeze the milestone and go to an arbitrator you both picked at the start. They read both sides\u2019 evidence and split the money. Final, instant, on-chain.' },
  ];
  return (
    <main style={{ flex: 1 }}>
      <section style={{ borderBottom: `1px solid ${T.line}` }}>
        <div style={{ ...S, paddingTop: 72 }}>
          <div style={{ maxWidth: 640 }}>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 2, color: T.mut, marginBottom: 18 }}>FREELANCE ESCROW · ON ETHEREUM</div>
            <h1 style={{ margin: '0 0 16px', fontSize: 44, lineHeight: 1.12, fontWeight: 500, letterSpacing: -0.8, textWrap: 'pretty' }}>
              The money is locked in.<br />The rules can&rsquo;t be bent.<br /><span style={{ color: T.sub }}>Nobody has to trust anybody.</span>
            </h1>
            <div style={{ fontSize: 16, color: T.sub, lineHeight: 1.65, marginBottom: 28, textWrap: 'pretty' }}>
              The client funds the whole job up front. The money sits in a contract neither side controls and pays out milestone by milestone — approved by the client, settled by an arbitrator, or released by a timer if nobody responds.
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 56 }}>
              <Link to="/create" style={{ fontSize: 15, fontWeight: 500, padding: '12px 24px', background: 'rgba(57,160,255,0.1)', border: `1px solid ${T.blue}`, color: T.blueT, borderRadius: 2 }}>Escrow your first job</Link>
              <Link to="/jobs" style={{ fontSize: 14, color: T.sub, padding: '12px 8px' }}>or browse live jobs — they&rsquo;re all public →</Link>
            </div>
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${T.line}`, background: T.panel }}>
          <div style={{ ...S, padding: '26px 24px 30px' }}>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 1.5, color: T.mut, marginBottom: 6 }}>EVERY MILESTONE RIDES THIS RAIL</div>
            <svg width="100%" height="110" viewBox="0 0 1010 110" style={{ display: 'block' }}>
              <line x1="60" y1="44" x2="420" y2="44" stroke={T.amber} strokeWidth="1.5" />
              <line x1="420" y1="44" x2="780" y2="44" stroke={T.line} strokeWidth="1.5" strokeDasharray="3 4" />
              <line x1="420" y1="44" x2="730" y2="14" stroke={T.auto} strokeWidth="1.5" strokeDasharray="7 5" style={{ animation: 'ledgerdash 1.1s linear infinite' }} />
              <line x1="420" y1="44" x2="560" y2="84" stroke={T.line} strokeWidth="1.5" strokeDasharray="3 4" />
              <line x1="560" y1="84" x2="860" y2="84" stroke={T.line} strokeWidth="1.5" strokeDasharray="3 4" />
              <circle cx="60" cy="44" r="5" fill={T.sub} stroke={T.sub} strokeWidth="1.5" />
              <circle cx="420" cy="44" r="5" fill={T.amber} stroke={T.amber} strokeWidth="1.5" />
              <circle cx="780" cy="44" r="5" fill={T.bg} stroke={T.dim} strokeWidth="1.5" />
              <circle cx="730" cy="14" r="4" fill={T.bg} stroke={T.auto} strokeWidth="1.5" />
              <circle cx="560" cy="84" r="4" fill={T.bg} stroke={T.dim} strokeWidth="1.5" />
              <circle cx="860" cy="84" r="4" fill={T.bg} stroke={T.dim} strokeWidth="1.5" />
              <text x="60" y="66" textAnchor="middle" fill={T.sub} style={{ fontFamily: mono, fontSize: 10 }}>WORK STARTS</text>
              <text x="420" y="66" textAnchor="middle" fill={T.amber} style={{ fontFamily: mono, fontSize: 10 }}>WORK SUBMITTED</text>
              <text x="780" y="66" textAnchor="middle" fill={T.cancel} style={{ fontFamily: mono, fontSize: 10 }}>CLIENT APPROVES → PAID</text>
              <text x="742" y="17" textAnchor="start" fill={T.auto} style={{ fontFamily: mono, fontSize: 10 }}>CLIENT SILENT 7 DAYS → PAID ANYWAY</text>
              <text x="560" y="104" textAnchor="middle" fill={T.cancel} style={{ fontFamily: mono, fontSize: 10 }}>DISAGREEMENT → DISPUTE</text>
              <text x="860" y="104" textAnchor="middle" fill={T.cancel} style={{ fontFamily: mono, fontSize: 10 }}>ARBITRATOR SPLITS IT</text>
              <text x="575" y="24" textAnchor="middle" fill={T.auto} style={{ fontFamily: mono, fontSize: 11 }}>{`pays anyway in ${d}d ${p(h)}:${p(m)}:${p(s)}`}</text>
            </svg>
          </div>
        </div>
      </section>
      <section style={{ borderBottom: `1px solid ${T.line}` }}>
        <div style={{ ...S, padding: '56px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            {promises.map((c) => (
              <div key={c.tag} style={{ border: `1px solid ${T.line}`, padding: '22px 22px 24px' }}>
                <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 1.5, color: c.color, marginBottom: 12 }}>{c.tag}</div>
                <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8, textWrap: 'pretty' }}>{c.head}</div>
                <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.6, textWrap: 'pretty' }}>{c.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section style={{ borderBottom: `1px solid ${T.line}` }}>
        <div style={{ ...S, padding: '56px 24px', display: 'flex', gap: 48, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 26, fontWeight: 500, letterSpacing: -0.4 }}>One fee. No subscriptions, no cuts of your rate.</h2>
            <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.65, textWrap: 'pretty' }}>1% of each payout, taken only when money actually moves. Cancel before work starts and every wei goes back — free.</div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Link to="/create" style={{ fontSize: 15, fontWeight: 500, padding: '12px 24px', background: 'rgba(57,160,255,0.1)', border: `1px solid ${T.blue}`, color: T.blueT, borderRadius: 2 }}>Create a job</Link>
            <span style={{ fontFamily: mono, fontSize: 11, color: T.mut }}>≈ 2 minutes · 1 signature (2 for USDC)</span>
          </div>
        </div>
      </section>
    </main>
  );
}
