import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useJob, useRole, useEscrowWrite, useWithdrawable } from '../hooks/useEscrow';
import { fmtAmount, net, fee, countdown, isEth } from '../lib/format';
import { uploadToIpfs, ipfsUrl } from '../lib/ipfs';
import { T, mono, ticket, btn, short, STATE_COLOR, STATE_LABEL } from '../theme';
import { EXPLORER } from '../config/wagmi';
import TxButton from '../components/TxButton';
import StateRail from '../components/StateRail';
import MoneyBar from '../components/MoneyBar';

const LEGEND = {
  APPROVED: 'paid to the freelancer', AUTO_RELEASED: 'paid automatically by the timer',
  DISPUTED: 'frozen until the arbitrator decides', SUBMITTED: 'submitted — on the clock',
  PENDING: 'still locked in escrow', RESOLVED: 'split by the arbitrator', CANCELLED: 'returned to the client',
};
const STAMP = {
  client: ['You\u2019re the client on this job', 'You review submitted work. Approve it to pay the freelancer, ask for changes, or open a dispute. If you do nothing after a submission, it pays out automatically when the timer ends.'],
  freelancer: ['You\u2019re the freelancer on this job', 'Submit your work milestone by milestone. Once the client approves — or the timer runs out — the money is yours to withdraw. Amounts show what you\u2019ll actually receive after the 1% fee.'],
  arbitrator: ['You\u2019re the arbitrator on this job', 'If a dispute is open, you choose how the frozen money is split between the two sides. Your ruling is final and executes immediately.'],
  observer: ['You\u2019re viewing as a guest', 'Everything on this page is public — no wallet needed to look around. Connect a wallet to take part. Anyone at all can trigger a payout once its timer expires.'],
};

function UploadPanel({ title, confirmLabel, confirmFn, kind, onConfirm, onCancel, phase }) {
  const [file, setFile] = useState(null);
  const [cid, setCid] = useState('');
  const [uploading, setUploading] = useState(false);
  const pick = async (f) => {
    setFile(f); setUploading(true);
    try { setCid(await uploadToIpfs(f)); } catch (e) { alert(e.message); setFile(null); }
    setUploading(false);
  };
  return (
    <div style={{ margin: '8px 0 4px', border: `1px solid ${T.line}`, borderLeft: `3px solid ${kind === 'danger' ? T.red : T.blue}`, padding: '14px 16px', background: T.panel }}>
      <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5, marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <label style={{ flex: 1, border: `1px dashed ${cid ? T.green : T.dim}`, padding: '10px 14px', cursor: 'pointer', fontSize: 12, color: cid ? T.greenT : T.sub, animation: uploading ? 'pulse 1.2s infinite' : 'none' }}>
          {uploading ? 'Uploading to IPFS…' : cid ? `Attached ✓ ${cid.slice(0, 10)}…` : '⊕ Click to attach a file'}
          <input type="file" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && pick(e.target.files[0])} />
        </label>
        <TxButton label={confirmLabel} fn={confirmFn} kind={kind} disabled={!cid} phase={phase} onClick={() => onConfirm(cid)} />
        <button onClick={onCancel} style={btn('quiet')}>Never mind</button>
      </div>
    </div>
  );
}

export default function JobDetail() {
  const { jobId } = useParams();
  const { job, milestones, refetch, isLoading } = useJob(jobId);
  const role = useRole(job);
  // Balances are per-token on-chain — scope this page's banner to the job's token.
  const { amount: withdrawable, refetch: refetchBal } = useWithdrawable(job?.token);
  const w = useEscrowWrite();
  const [open, setOpen] = useState(null); // { kind, i }
  const [reason, setReason] = useState('');
  const [split, setSplit] = useState(50);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  if (isLoading || !job) return <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.mut, fontFamily: mono, fontSize: 12 }}>reading the chain…</main>;

  const token = job.token;
  const timelock = Number(job.timelock);
  const total = milestones.reduce((a, m) => a + m.amount, 0n);
  const anyDisputed = milestones.some((m) => m.state === 'DISPUTED');
  const allDone = milestones.every((m) => ['APPROVED', 'AUTO_RELEASED', 'RESOLVED'].includes(m.state));
  const jobState = job.cancelled ? 'Cancelled' : anyDisputed ? 'In dispute' : allDone ? 'Completed' : 'In progress';
  const jobColor = job.cancelled ? STATE_COLOR.CANCELLED : anyDisputed ? T.red : allDone ? T.green : T.blue;
  const done = (fnAfter) => () => { refetch(); refetchBal(); setOpen(null); setReason(''); w.reset(); fnAfter?.(); };

  const statusFor = (m, cd) => {
    switch (m.state) {
      case 'APPROVED': return role === 'freelancer' ? `Approved — ${fmtAmount(net(m.amount), token)} was credited to you.` : `Approved — the freelancer was paid ${fmtAmount(net(m.amount), token)}.`;
      case 'AUTO_RELEASED': return 'Paid automatically — the client didn\u2019t respond in time, so the contract released it on its own.';
      case 'DISPUTED': return 'Frozen — nothing moves until the arbitrator decides the split.';
      case 'SUBMITTED':
        if (cd.expired) return 'The review window has closed. Anyone can now trigger the payout to the freelancer.';
        if (role === 'client') return `The work is in — take a look. If you don\u2019t respond within ${cd.long}, it pays out automatically.`;
        if (role === 'freelancer') return `You\u2019ve submitted this. The client has ${cd.long} to respond — after that, you get paid automatically.`;
        return `Work submitted — the client has ${cd.long} to respond before it pays out on its own.`;
      case 'RESOLVED': return 'Settled — the arbitrator decided the split and both sides were paid out.';
      case 'CANCELLED': return 'Never started — the job was cancelled and this money went back to the client.';
      default: return role === 'freelancer' ? 'Up next — submit your work here whenever it\u2019s ready.' : 'Not started — the money sits safely in escrow until work is submitted.';
    }
  };

  const jid = BigInt(jobId);
  const dt = { fontFamily: mono, fontSize: 9, letterSpacing: 1.5, color: T.mut, alignSelf: 'center' };
  const dd = { margin: 0, fontFamily: mono, fontSize: 11 };

  return (
    <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '330px 1fr' }}>
      <aside style={{ borderRight: `1px solid ${T.line}`, padding: '22px 20px' }}>
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 1.5, marginBottom: 10 }}>
          <Link to="/jobs" style={{ color: T.mut }}>JOBS</Link> <span style={{ color: T.mut }}>/ #{String(jobId).padStart(4, '0')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Job #{String(jobId).padStart(4, '0')}</h1>
          <span style={ticket(jobColor)}>{jobState}</span>
        </div>
        <div style={{ border: `1px solid ${role === 'observer' ? T.line : T.blue}`, borderLeft: `3px solid ${role === 'observer' ? T.dim : T.blue}`, padding: '12px 14px', background: role === 'observer' ? 'transparent' : 'rgba(57,160,255,0.04)' }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 5 }}>{STAMP[role][0]}</div>
          <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.55 }}>{STAMP[role][1]}</div>
        </div>
        <dl style={{ margin: '22px 0 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '9px 14px', fontSize: 12 }}>
          <dt style={dt}>CLIENT</dt><dd style={dd}><a href={`${EXPLORER}/address/${job.client}`} target="_blank" rel="noreferrer" style={{ color: T.body }}>{short(job.client)}</a></dd>
          <dt style={dt}>FREELANCER</dt><dd style={dd}><a href={`${EXPLORER}/address/${job.freelancer}`} target="_blank" rel="noreferrer" style={{ color: T.body }}>{short(job.freelancer)}</a></dd>
          <dt style={dt}>ARBITRATOR</dt><dd style={dd}><a href={`${EXPLORER}/address/${job.arbitrator}`} target="_blank" rel="noreferrer" style={{ color: T.body }}>{short(job.arbitrator)}</a></dd>
          <dt style={dt}>PAID IN</dt><dd style={{ ...dd, color: T.text }}>{isEth(token) ? 'ETH' : 'USDC'}</dd>
          <dt style={dt}>IN ESCROW</dt><dd style={{ ...dd, color: T.text }}>{fmtAmount(total, token)}</dd>
          <dt style={dt}>FEE</dt><dd style={{ ...dd, fontFamily: undefined, fontSize: 12, color: T.sub }}>1% of each payout</dd>
          <dt style={dt}>TIMER</dt><dd style={{ ...dd, fontFamily: undefined, fontSize: 12, color: T.sub }}>{Math.round(timelock / 86400)} days — then submitted work pays out automatically</dd>
        </dl>
        <div style={{ marginTop: 26 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: T.body, marginBottom: 4 }}>Where the money is</div>
          <div style={{ fontSize: 11, color: T.mut, marginBottom: 8 }}>Every wei is in exactly one of these places.</div>
          <MoneyBar milestones={milestones} token={token} legendLabels={LEGEND} />
        </div>
      </aside>

      <section style={{ minWidth: 0 }}>
        {withdrawable > 0n && (
          <div style={{ borderBottom: `1px solid ${T.line}`, borderLeft: `3px solid ${T.green}`, background: 'rgba(63,190,126,0.05)', padding: '10px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 13 }}>You have <span style={{ fontFamily: mono, color: T.greenT }}>{fmtAmount(withdrawable, token)}</span> ready to collect.</span>
            <div style={{ flex: 1 }} />
            <TxButton label={`Withdraw ${fmtAmount(withdrawable, token)}`} fn="withdraw()" kind="green"
              phase={open?.kind === 'wd' ? w.phase : 'idle'}
              onClick={() => { setOpen({ kind: 'wd' }); w.send('withdraw', [token]); }} onSuccess={done()} />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: '18px 24px 10px' }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Milestones</span>
          <span style={{ fontFamily: mono, fontSize: 10, color: T.dim }}>{milestones.length} milestones · {fmtAmount(total, token)} total</span>
        </div>
        {milestones.map((m) => {
          const cd = countdown(m.submittedAt, timelock, now);
          const isTx = (k) => open?.kind === k && open?.i === m.index;
          const acts = [];
          if (m.state === 'SUBMITTED' && !job.cancelled) {
            if (role === 'client') {
              acts.push(<TxButton key="ap" label={`Approve & pay ${fmtAmount(net(m.amount), token)}`} fn="approveMilestone" kind="primary"
                phase={isTx('approve') ? w.phase : 'idle'}
                onClick={() => { setOpen({ kind: 'approve', i: m.index }); w.send('approveMilestone', [jid, BigInt(m.index)]); }} onSuccess={done()} />);
              acts.push(<button key="rj" onClick={() => setOpen({ kind: 'reject', i: m.index })} style={btn('quiet')}>
                <span style={{ display: 'block', fontWeight: 500 }}>Ask for changes</span>
                <span style={{ display: 'block', fontFamily: mono, fontSize: 9, opacity: 0.55, marginTop: 2 }}>rejectMilestone</span></button>);
            }
            if (role === 'client' || role === 'freelancer') {
              acts.push(<button key="dp" onClick={() => setOpen({ kind: 'dispute', i: m.index })} style={btn('danger')}>
                <span style={{ display: 'block', fontWeight: 500 }}>Open a dispute</span>
                <span style={{ display: 'block', fontFamily: mono, fontSize: 9, opacity: 0.55, marginTop: 2 }}>raiseDispute</span></button>);
            }
            if (cd.expired) {
              acts.push(<TxButton key="cl" label="Trigger the payout" fn="claimTimelockRelease" kind="primary"
                phase={isTx('claim') ? w.phase : 'idle'}
                onClick={() => { setOpen({ kind: 'claim', i: m.index }); w.send('claimTimelockRelease', [jid, BigInt(m.index)]); }} onSuccess={done()} />);
            }
          }
          if (m.state === 'PENDING' && role === 'freelancer' && job.accepted && !job.cancelled) {
            acts.push(<button key="sb" onClick={() => setOpen({ kind: 'submit', i: m.index })} style={btn('primary')}>
              <span style={{ display: 'block', fontWeight: 500 }}>Submit your work</span>
              <span style={{ display: 'block', fontFamily: mono, fontSize: 9, opacity: 0.55, marginTop: 2 }}>submitMilestone</span></button>);
          }
          if (m.state === 'DISPUTED' && role === 'arbitrator') {
            acts.push(<button key="rs" onClick={() => setOpen({ kind: 'resolve', i: m.index })} style={btn('violet')}>
              <span style={{ display: 'block', fontWeight: 500 }}>Decide the split</span>
              <span style={{ display: 'block', fontFamily: mono, fontSize: 9, opacity: 0.55, marginTop: 2 }}>resolveDispute</span></button>);
          }
          const fShare = (m.amount * BigInt(split)) / 100n;
          return (
            <div key={m.index} style={{ borderTop: `1px solid ${T.hair}`, padding: '14px 24px 12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '36px minmax(200px,1fr) 460px 150px 150px', gap: 16, alignItems: 'center' }}>
                <div style={{ fontFamily: mono, fontSize: 12, color: T.mut }}>{`0${m.index + 1}`}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Milestone {m.index + 1}</div>
                  <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5, marginTop: 3, textWrap: 'pretty' }}>{statusFor(m, cd)}</div>
                  {m.cid && <div style={{ fontFamily: mono, fontSize: 10, marginTop: 4 }}><span style={{ color: T.mut }}>the work</span> <a href={ipfsUrl(m.cid)} target="_blank" rel="noreferrer">{m.cid.slice(0, 12)}… ↗</a></div>}
                </div>
                <StateRail state={m.state}
                  countdownText={m.state === 'SUBMITTED' ? (cd.expired ? 'timer expired — anyone can trigger the payout' : `auto-pays in ${cd.text}`) : null}
                  countdownColor={cd.expired ? T.red : T.auto} />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: mono, fontSize: 13 }}>{fmtAmount(m.amount, token)}</div>
                  {(m.state === 'SUBMITTED' || m.state === 'DISPUTED') && (
                    <div style={{ fontFamily: mono, fontSize: 9.5, color: T.mut, marginTop: 3 }}>freelancer gets {fmtAmount(net(m.amount), token)} · 1% fee {fmtAmount(fee(m.amount), token)}</div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                  <span style={ticket(STATE_COLOR[m.state])}>{STATE_LABEL[m.state]}</span>
                  <span style={{ fontFamily: mono, fontSize: 8.5, color: T.dim, letterSpacing: 1 }}>{m.state}</span>
                </div>
              </div>
              {acts.length > 0 && <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '8px 0 4px' }}>{acts}</div>}
              {isTx('reject') && (
                <div style={{ margin: '8px 0 4px', border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.red}`, padding: '14px 16px', background: T.panel }}>
                  <div style={{ fontSize: 12, color: T.sub, marginBottom: 10 }}>Tell the freelancer what needs fixing. Your note is recorded on-chain and they can resubmit — no money moves.</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. the layout breaks on mobile — see milestone spec §2"
                      style={{ flex: 1, background: T.bg, border: `1px solid ${T.line}`, color: T.text, fontSize: 12, padding: '8px 10px' }} />
                    <TxButton label="Send it back" fn="rejectMilestone" kind="danger" disabled={!reason.trim()} phase={w.phase}
                      onClick={() => w.send('rejectMilestone', [jid, BigInt(m.index), reason.trim()])} onSuccess={done()} />
                    <button onClick={() => setOpen(null)} style={btn('quiet')}>Never mind</button>
                  </div>
                </div>
              )}
              {isTx('resolve') && (
                <div style={{ margin: '8px 0 4px', border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.violet}`, padding: '14px 16px', background: T.panel }}>
                  <div style={{ fontSize: 12, color: T.sub, marginBottom: 12 }}>Drag to decide how much of this milestone each side receives. Your ruling executes immediately and can&rsquo;t be undone.</div>
                  <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: T.mut }}>Client</span>
                    <input type="range" min="0" max="100" value={split} onChange={(e) => setSplit(+e.target.value)} style={{ flex: 1, accentColor: T.violet }} />
                    <span style={{ fontSize: 11, color: T.mut }}>Freelancer</span>
                  </div>
                  <div style={{ display: 'flex', gap: 26, marginTop: 12, fontSize: 12, alignItems: 'center' }}>
                    <span style={{ color: T.sub }}>Freelancer gets <span style={{ fontFamily: mono, color: T.text }}>{fmtAmount(fShare, token)}</span> <span style={{ fontFamily: mono, color: T.mut }}>({fmtAmount(net(fShare), token)} after fee)</span></span>
                    <span style={{ color: T.sub }}>Client gets back <span style={{ fontFamily: mono, color: T.text }}>{fmtAmount(m.amount - fShare, token)}</span></span>
                    <div style={{ flex: 1 }} />
                    <TxButton label={`Make it final — ${split}% to the freelancer`} fn={`resolveDispute(${split * 100} bps)`} kind="violet" phase={w.phase}
                      onClick={() => w.send('resolveDispute', [jid, BigInt(m.index), split * 100])} onSuccess={done()} />
                    <button onClick={() => setOpen(null)} style={btn('quiet')}>Never mind</button>
                  </div>
                </div>
              )}
              {isTx('submit') && (
                <UploadPanel kind="primary"
                  title="Attach your finished work. It's stored on IPFS — a public file network — and only its fingerprint goes on-chain. Submitting starts the client's review clock."
                  confirmLabel="Submit it" confirmFn="submitMilestone" phase={w.phase}
                  onConfirm={(cid) => w.send('submitMilestone', [jid, BigInt(m.index), cid])}
                  onCancel={() => setOpen(null)} />
              )}
              {isTx('dispute') && (
                <UploadPanel kind="danger"
                  title="Attach your evidence (screenshots, briefs, conversations). It goes to the arbitrator, and this milestone freezes until they rule."
                  confirmLabel="Open the dispute" confirmFn="raiseDispute" phase={w.phase}
                  onConfirm={(cid) => w.send('raiseDispute', [jid, BigInt(m.index), cid])}
                  onCancel={() => setOpen(null)} />
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}
