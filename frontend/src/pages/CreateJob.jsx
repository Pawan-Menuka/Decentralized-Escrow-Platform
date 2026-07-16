import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseEther, parseUnits, isAddress, zeroAddress } from 'viem';
import { useEscrowWrite, useUsdcApprove } from '../hooks/useEscrow';
import { USDC_ADDRESS } from '../config/contract';
import { T, mono, btn } from '../theme';
import TxButton from '../components/TxButton';

const input = { width: '100%', boxSizing: 'border-box', background: T.bg, border: `1px solid ${T.line}`, color: T.text, fontFamily: mono, fontSize: 12, padding: '10px 12px' };
const choice = (active) => ({ flex: 1, textAlign: 'left', padding: '12px 16px', cursor: 'pointer', borderRadius: 2, background: active ? 'rgba(57,160,255,0.08)' : 'transparent', border: active ? `1px solid ${T.blue}` : `1px solid ${T.line}`, color: active ? T.text : T.sub, fontSize: 13 });
const TIMELOCKS = { '3 days': 3 * 86400, '7 days': 7 * 86400, '14 days': 14 * 86400 };

export default function CreateJob() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [fAddr, setFAddr] = useState(''); const [aAddr, setAAddr] = useState('');
  const [tok, setTok] = useState('ETH');
  const [tl, setTl] = useState('7 days');
  const [rows, setRows] = useState([{ title: '', amt: '' }, { title: '', amt: '' }]);
  const [approved, setApproved] = useState(false);
  const usdc = tok === 'USDC';
  const w = useEscrowWrite();
  const ap = useUsdcApprove();

  const parseAmt = (v) => { const n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : n; };
  const total = rows.reduce((a, r) => a + parseAmt(r.amt), 0);
  const validRows = rows.filter((r) => r.title.trim() && parseAmt(r.amt) > 0);
  const fmt = (v) => (usdc ? `${v.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC` : `${v.toFixed(4)} ETH`);
  const toWei = (v) => (usdc ? parseUnits(String(v), 6) : parseEther(String(v)));

  const create = () => {
    const amounts = validRows.map((r) => toWei(parseAmt(r.amt)));
    w.send('createJob',
      [fAddr.trim(), aAddr.trim(), usdc ? USDC_ADDRESS : zeroAddress, amounts, BigInt(TIMELOCKS[tl])],
      usdc ? undefined : toWei(total));
  };

  const steps = ['Who', 'The money', 'The rules', 'Fund it'];
  const panel = { border: `1px solid ${T.line}`, background: T.panel, padding: 24 };
  const label = { fontSize: 12, color: T.sub, marginBottom: 6 };

  return (
    <main style={{ flex: 1, maxWidth: 920, width: '100%', margin: '0 auto', padding: '30px 24px 60px', boxSizing: 'border-box' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 500 }}>Create a job</h1>
      <div style={{ fontSize: 13, color: T.sub, marginBottom: 24, textWrap: 'pretty' }}>You fund the whole job up front — the money sits in the contract, not with us, and pays out milestone by milestone as work is approved.</div>
      <div style={{ display: 'flex', marginBottom: 26, border: `1px solid ${T.line}` }}>
        {steps.map((s, i) => {
          const n = i + 1, active = step === n, past = step > n;
          return (
            <div key={s} style={{ flex: 1, padding: '10px 16px', fontSize: 12, fontWeight: active ? 500 : 400, color: active ? T.text : past ? T.green : T.mut, background: active ? T.raised : 'transparent', borderRight: i < 3 ? `1px solid ${T.line}` : 'none', borderBottom: active ? `2px solid ${T.blue}` : '2px solid transparent' }}>
              <span style={{ fontFamily: mono, fontSize: 10, marginRight: 8 }}>{`0${n}`}</span>{s}
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <div style={panel}>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>Who&rsquo;s involved</div>
          <div style={{ fontSize: 12, color: T.sub, marginBottom: 20 }}>Three wallets, three roles. Pick the arbitrator together with your freelancer — they only step in if you two disagree.</div>
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <div style={label}>Freelancer&rsquo;s wallet address</div>
              <input value={fAddr} onChange={(e) => setFAddr(e.target.value)} placeholder="0x…" style={input} />
              {isAddress(fAddr.trim()) && <div style={{ fontSize: 11, color: T.greenT, marginTop: 5 }}>✓ Valid address — this wallet will be able to accept the job</div>}
              {fAddr.trim().length > 8 && !isAddress(fAddr.trim()) && <div style={{ fontSize: 11, color: T.red, marginTop: 5 }}>That doesn&rsquo;t look like an Ethereum address — it should start with 0x and be 42 characters.</div>}
            </div>
            <div>
              <div style={label}>Arbitrator&rsquo;s wallet address</div>
              <input value={aAddr} onChange={(e) => setAAddr(e.target.value)} placeholder="0x…" style={input} />
              <div style={{ fontSize: 11, color: T.mut, marginTop: 5 }}>A neutral third party you both trust. They can&rsquo;t touch the money unless a dispute is opened.</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
            <button onClick={() => setStep(2)} disabled={!(isAddress(fAddr.trim()) && isAddress(aAddr.trim()))} style={btn('primary', !(isAddress(fAddr.trim()) && isAddress(aAddr.trim())))}>Next: the money</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={panel}>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>The money</div>
          <div style={{ fontSize: 12, color: T.sub, marginBottom: 20 }}>Pick what you&rsquo;ll pay in, and split the job into milestones — each one pays out separately.</div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
            <button onClick={() => { setTok('ETH'); setApproved(false); }} style={choice(!usdc)}>
              <span style={{ display: 'block', fontWeight: 500 }}>ETH</span>
              <span style={{ display: 'block', fontSize: 11, opacity: 0.6, marginTop: 2 }}>one signature to fund</span>
            </button>
            <button onClick={() => { setTok('USDC'); setApproved(false); }} style={choice(usdc)}>
              <span style={{ display: 'block', fontWeight: 500 }}>USDC</span>
              <span style={{ display: 'block', fontSize: 11, opacity: 0.6, marginTop: 2 }}>stable dollars — two signatures to fund</span>
            </button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 170px 34px', gap: 10, alignItems: 'center' }}>
                <span style={{ fontFamily: mono, fontSize: 11, color: T.mut }}>{`0${i + 1}`}</span>
                <input value={r.title} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="What gets delivered, e.g. Wireframes" style={{ ...input, fontFamily: undefined, fontSize: 13 }} />
                <input value={r.amt} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amt: e.target.value } : x)))} placeholder={usdc ? 'amount in USDC' : 'amount in ETH'} style={{ ...input, textAlign: 'right' }} />
                <button onClick={() => rows.length > 1 && setRows(rows.filter((_, j) => j !== i))} style={{ background: 'transparent', border: `1px solid ${T.line}`, color: T.mut, cursor: 'pointer', padding: '8px 0', fontSize: 13 }}>×</button>
              </div>
            ))}
          </div>
          <button onClick={() => setRows([...rows, { title: '', amt: '' }])} style={{ marginTop: 10, background: 'transparent', border: `1px dashed ${T.dim}`, color: T.sub, cursor: 'pointer', padding: '8px 16px', fontSize: 12 }}>+ Add a milestone</button>
          <div style={{ marginTop: 20, borderTop: `1px solid ${T.line}`, paddingTop: 14, display: 'flex', gap: 28, fontSize: 12, color: T.sub, alignItems: 'baseline' }}>
            <span>Total to escrow <span style={{ fontFamily: mono, color: T.text, fontSize: 14 }}>{fmt(total)}</span></span>
            <span>Freelancer receives <span style={{ fontFamily: mono, color: T.body }}>{fmt(total * 0.99)}</span> <span style={{ color: T.mut }}>after the 1% fee</span></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
            <button onClick={() => setStep(1)} style={btn('quiet')}>Back</button>
            <button onClick={() => setStep(3)} disabled={validRows.length === 0} style={btn('primary', validRows.length === 0)}>Next: the rules</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={panel}>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>The rules</div>
          <div style={{ fontSize: 12, color: T.sub, marginBottom: 20 }}>One rule protects the freelancer from silence: if you don&rsquo;t respond to submitted work in time, it pays out automatically.</div>
          <div style={{ fontSize: 12, color: T.sub, marginBottom: 8 }}>Your review window per milestone</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {Object.keys(TIMELOCKS).map((k) => (
              <button key={k} onClick={() => setTl(k)} style={choice(tl === k)}>
                <span style={{ display: 'block', fontWeight: 500 }}>{k}</span>
                <span style={{ display: 'block', fontSize: 11, opacity: 0.6, marginTop: 2 }}>{k === '7 days' ? 'the usual choice' : k === '3 days' ? 'for fast-moving work' : 'for big deliverables'}</span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 18, border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.amber}`, padding: '12px 14px', fontSize: 12, color: T.sub, lineHeight: 1.55, textWrap: 'pretty' }}>
            Example: the freelancer submits on a Monday with a {tl} window. If you haven&rsquo;t approved, asked for changes, or disputed by the deadline, the contract pays them on its own — no one can stop it, including us.
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
            <button onClick={() => setStep(2)} style={btn('quiet')}>Back</button>
            <button onClick={() => setStep(4)} style={btn('primary')}>Review everything</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div style={panel}>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>Check it, then fund it</div>
          <div style={{ fontSize: 12, color: T.sub, marginBottom: 20, textWrap: 'pretty' }}>Once funded, these terms are locked into the contract. You can cancel and get everything back any time before the freelancer accepts.</div>
          <dl style={{ margin: '0 0 18px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '9px 18px', fontSize: 13 }}>
            <dt style={{ color: T.mut }}>Freelancer</dt><dd style={{ margin: 0, fontFamily: mono, fontSize: 12 }}>{fAddr.trim()}</dd>
            <dt style={{ color: T.mut }}>Arbitrator</dt><dd style={{ margin: 0, fontFamily: mono, fontSize: 12 }}>{aAddr.trim()}</dd>
            <dt style={{ color: T.mut }}>Milestones</dt><dd style={{ margin: 0 }}>{validRows.map((r) => `${r.title.trim()} (${fmt(parseAmt(r.amt))})`).join(' · ')}</dd>
            <dt style={{ color: T.mut }}>Review window</dt><dd style={{ margin: 0 }}>{tl} per milestone, then automatic payout</dd>
            <dt style={{ color: T.mut }}>Total to escrow</dt><dd style={{ margin: 0, fontFamily: mono, color: T.text }}>{fmt(total)}</dd>
            <dt style={{ color: T.mut }}>Service fee</dt><dd style={{ margin: 0 }}>1% of each payout — {fmt(total * 0.01)} total if all milestones complete</dd>
          </dl>
          {usdc && (
            <div style={{ border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.blue}`, padding: '14px 16px', marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.55, marginBottom: 12 }}>USDC needs two signatures: first you allow the contract to take your USDC, then it actually moves. Two wallet pop-ups, in this order — this is normal.</div>
              <TxButton label={approved ? 'Allowance given ✓' : 'Allow USDC (signature 1 of 2)'} fn="usdc.approve(escrow, amount)" kind="primary"
                disabled={approved} phase={approved ? 'idle' : ap.phase}
                onClick={() => ap.approve(toWei(total))} onSuccess={() => setApproved(true)} />
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={() => setStep(3)} style={btn('quiet')}>Back</button>
            <TxButton label={usdc ? `Escrow ${fmt(total)} (signature 2 of 2)` : `Escrow ${fmt(total)} & create the job`}
              fn={usdc ? 'createJob(…) — pulls the USDC' : 'createJob{value: total}(…)'} kind="green"
              disabled={usdc && !approved} phase={w.phase} onClick={create}
              onSuccess={() => nav('/jobs')} />
          </div>
        </div>
      )}
    </main>
  );
}
