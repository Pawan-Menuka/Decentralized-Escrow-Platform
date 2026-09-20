import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatUnits, getAddress, isAddress, zeroAddress } from 'viem';
import { useAccount, usePublicClient, useReadContract } from 'wagmi';
import { useEscrowWrite, useUsdcApprove } from '../hooks/useEscrow';
import { ERC20_ABI, ESCROW_ABI, ESCROW_ADDRESS, USDC_ADDRESS } from '../config/contract';
import { SEPOLIA_DEPLOYMENT } from '../config/deployment';
import { displayAmount, feeAmount, parseExactAmount, sumAmounts, usdAmountsToWei } from '../lib/amounts';
import { T, mono, btn, short } from '../theme';
import TxButton from '../components/TxButton';

const field: CSSProperties = { width: '100%', boxSizing: 'border-box', background: T.bg, border: `1px solid ${T.line}`, color: T.text, fontFamily: mono, fontSize: 12, padding: '10px 12px' };
const choice = (active: boolean): CSSProperties => ({ flex: 1, textAlign: 'left', padding: '12px 16px', cursor: 'pointer', borderRadius: 2, background: active ? 'rgba(57,160,255,0.08)' : 'transparent', border: active ? `1px solid ${T.blue}` : `1px solid ${T.line}`, color: active ? T.text : T.sub, fontSize: 13 });
const TIMELOCKS = { '3 days': 3 * 86400, '7 days': 7 * 86400, '14 days': 14 * 86400 } as const;
const FEED_ABI = [{ type: 'function', name: 'latestRoundData', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' }] }] as const;
const MAX_UINT128 = (1n << 128n) - 1n;
type TimelockLabel = keyof typeof TIMELOCKS;
type FundingMode = 'ETH' | 'USD' | 'USDC';
interface MilestoneRow { amount: string }

export default function CreateJob() {
  const nav = useNavigate();
  const publicClient = usePublicClient();
  const { address: client } = useAccount();
  const [step, setStep] = useState(1);
  const [freelancer, setFreelancer] = useState('');
  const [arbitrator, setArbitrator] = useState('');
  const [mode, setMode] = useState<FundingMode>('ETH');
  const [timelock, setTimelock] = useState<TimelockLabel>('7 days');
  const [rows, setRows] = useState<MilestoneRow[]>([{ amount: '' }, { amount: '' }]);
  const [quoteError, setQuoteError] = useState('');
  const write = useEscrowWrite();
  const approval = useUsdcApprove();

  const contract = { address: ESCROW_ADDRESS, abi: ESCROW_ABI } as const;
  const { data: minTimelock = 3600 } = useReadContract({ ...contract, functionName: 'MIN_TIMELOCK' });
  const { data: maxTimelock = 90 * 86400 } = useReadContract({ ...contract, functionName: 'MAX_TIMELOCK' });
  const { data: maxMilestones = 50 } = useReadContract({ ...contract, functionName: 'MAX_MILESTONES' });
  const { data: feeBps = 100 } = useReadContract({ ...contract, functionName: 'feeBps' });
  const { data: staleAfter = 3600 } = useReadContract({ ...contract, functionName: 'PRICE_STALENESS_THRESHOLD' });
  const { data: usdcDecimals = 6 } = useReadContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'decimals' });
  const { data: allowance = 0n, refetch: refetchAllowance } = useReadContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: client ? [client, ESCROW_ADDRESS] : undefined, query: { enabled: Boolean(client) && mode === 'USDC' } });
  const quote = useReadContract({ address: SEPOLIA_DEPLOYMENT.ethUsdFeed, abi: FEED_ABI, functionName: 'latestRoundData', query: { enabled: mode === 'USD', refetchInterval: 30_000 } });

  const decimals = mode === 'ETH' ? 18 : mode === 'USD' ? 8 : Number(usdcDecimals);
  const symbol = mode === 'ETH' ? 'ETH' : mode === 'USD' ? 'USD' : 'USDC';
  const parsed = useMemo(() => rows.map((row) => parseExactAmount(row.amount, decimals)), [rows, decimals]);
  const amounts = parsed.every((amount): amount is bigint => amount !== null && amount > 0n && amount <= MAX_UINT128) ? parsed : [];
  const rowsValid = rows.length >= 1 && rows.length <= Number(maxMilestones) && amounts.length === rows.length;
  const total = rowsValid ? sumAmounts(amounts) : 0n;
  const price = quote.data?.[1] && quote.data[1] > 0n ? quote.data[1] : 0n;
  const quoteTimestamp = Number(quote.data?.[3] ?? 0n);
  const quoteAge = quoteTimestamp ? Math.max(0, Math.floor(Date.now() / 1000) - quoteTimestamp) : Infinity;
  const quoteStale = quoteAge > Number(staleAfter);
  const quotedWei = mode === 'USD' && price > 0n && amounts.length ? usdAmountsToWei(amounts, price) : [];
  const fundingTotal = mode === 'USD' ? sumAmounts(quotedWei) : total;
  const feeTotal = sumAmounts((mode === 'USD' ? quotedWei : amounts).map((amount) => feeAmount(amount, BigInt(feeBps))));
  const approved = mode === 'USDC' && total > 0n && allowance >= total;
  const addressesValid = isAddress(freelancer.trim()) && isAddress(arbitrator.trim())
    && freelancer.trim().toLowerCase() !== zeroAddress && arbitrator.trim().toLowerCase() !== zeroAddress
    && freelancer.trim().toLowerCase() !== arbitrator.trim().toLowerCase()
    && (!client || (freelancer.trim().toLowerCase() !== client.toLowerCase() && arbitrator.trim().toLowerCase() !== client.toLowerCase()));
  const timelockValid = TIMELOCKS[timelock] >= Number(minTimelock) && TIMELOCKS[timelock] <= Number(maxTimelock);

  const create = async () => {
    setQuoteError('');
    if (!rowsValid || !addressesValid || !timelockValid || !publicClient) return;
    const parties = [getAddress(freelancer.trim()), getAddress(arbitrator.trim())] as const;
    if (mode === 'USD') {
      try {
        const latest = await publicClient.readContract({ address: SEPOLIA_DEPLOYMENT.ethUsdFeed, abi: FEED_ABI, functionName: 'latestRoundData' });
        const latestAge = Math.floor(Date.now() / 1000) - Number(latest[3]);
        if (latest[1] <= 0n || latestAge > Number(staleAfter)) { setQuoteError('The Chainlink quote is stale or invalid. Wait for an update and try again.'); return; }
        await write.send('createJobUsd', [parties[0], parties[1], amounts, BigInt(TIMELOCKS[timelock])], sumAmounts(usdAmountsToWei(amounts, latest[1])));
      } catch (error) { setQuoteError(error instanceof Error ? error.message : 'Could not refresh the Chainlink quote.'); }
      return;
    }
    await write.send('createJob', [parties[0], parties[1], mode === 'USDC' ? USDC_ADDRESS : zeroAddress, amounts, BigInt(TIMELOCKS[timelock])], mode === 'ETH' ? total : undefined);
  };

  const money = (amount: bigint) => displayAmount(amount, decimals, symbol);
  const steps = ['Who', 'The money', 'The rules', 'Fund it'];
  const panel = { border: `1px solid ${T.line}`, background: T.panel, padding: 24 };
  const label = { fontSize: 12, color: T.sub, marginBottom: 6 };

  return <main style={{ flex: 1, maxWidth: 920, width: '100%', margin: '0 auto', padding: '30px 24px 60px', boxSizing: 'border-box' }}>
    <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 500 }}>Create a job</h1>
    <div style={{ fontSize: 13, color: T.sub, marginBottom: 24 }}>Fund the complete job up front. The contract releases it milestone by milestone.</div>
    <div style={{ display: 'flex', marginBottom: 26, border: `1px solid ${T.line}` }}>{steps.map((name, index) => <div key={name} style={{ flex: 1, padding: '10px 16px', fontSize: 12, color: step === index + 1 ? T.text : step > index + 1 ? T.green : T.mut, background: step === index + 1 ? T.raised : 'transparent', borderRight: index < 3 ? `1px solid ${T.line}` : 'none', borderBottom: step === index + 1 ? `2px solid ${T.blue}` : '2px solid transparent' }}><span style={{ fontFamily: mono, fontSize: 10, marginRight: 8 }}>0{index + 1}</span>{name}</div>)}</div>

    {step === 1 && <div style={panel}>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>Who&rsquo;s involved</div><div style={{ fontSize: 12, color: T.sub, marginBottom: 20 }}>Choose a freelancer and a neutral arbitrator. Neither can be your connected client wallet.</div>
      <div style={{ display: 'grid', gap: 16 }}><div><div style={label}>Freelancer wallet</div><input value={freelancer} onChange={(event) => setFreelancer(event.target.value)} placeholder="0x…" style={field} /></div><div><div style={label}>Arbitrator wallet</div><input value={arbitrator} onChange={(event) => setArbitrator(event.target.value)} placeholder="0x…" style={field} /></div></div>
      <div style={{ fontSize: 11, color: T.mut, marginTop: 12, lineHeight: 1.5 }}>The selected arbitrator is snapshotted into this job and cannot be replaced by a later protocol-default change. The current global default is {short(SEPOLIA_DEPLOYMENT.defaultArbitrator)}, but this form records your explicit choice.</div>
      {!addressesValid && (freelancer.length > 8 || arbitrator.length > 8) && <div role="alert" style={{ color: T.red, fontSize: 11, marginTop: 8 }}>Use two valid, distinct addresses that are also different from the connected client wallet.</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}><button onClick={() => setStep(2)} disabled={!addressesValid} style={btn('primary', !addressesValid)}>Next: the money</button></div>
    </div>}

    {step === 2 && <div style={panel}>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>The money</div><div style={{ fontSize: 12, color: T.sub, marginBottom: 20 }}>Amounts are parsed as exact integers—transaction values never use floating-point arithmetic.</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>{(['ETH', 'USD', 'USDC'] as FundingMode[]).map((item) => <button key={item} onClick={() => { setMode(item); approval.reset(); }} style={choice(mode === item)}><span style={{ display: 'block', fontWeight: 500 }}>{item === 'USD' ? 'USD → ETH' : item}</span><span style={{ display: 'block', fontSize: 11, opacity: 0.6, marginTop: 2 }}>{item === 'USD' ? 'Chainlink-priced ETH funding' : item === 'USDC' ? 'two confirmed transactions' : 'direct native funding'}</span></button>)}</div>
      <div style={{ display: 'grid', gap: 8 }}>{rows.map((row, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 34px', gap: 10, alignItems: 'center' }}><span style={{ fontSize: 13 }}>Milestone {index + 1}</span><input aria-label={`Milestone ${index + 1} amount`} value={row.amount} onChange={(event) => setRows(rows.map((entry, i) => i === index ? { amount: event.target.value } : entry))} placeholder={`amount in ${symbol}`} inputMode="decimal" style={{ ...field, textAlign: 'right' }} /><button aria-label={`Remove milestone ${index + 1}`} onClick={() => rows.length > 1 && setRows(rows.filter((_, i) => i !== index))} style={{ background: 'transparent', border: `1px solid ${T.line}`, color: T.mut, cursor: 'pointer', padding: '8px 0' }}>×</button></div>)}</div>
      <div style={{ fontSize: 11, color: T.mut, marginTop: 8 }}>This contract stores ordered milestone amounts, not titles. Detailed specifications should remain in the parties&rsquo; external agreement.</div>
      <button disabled={rows.length >= Number(maxMilestones)} onClick={() => setRows([...rows, { amount: '' }])} style={{ marginTop: 10, background: 'transparent', border: `1px dashed ${T.dim}`, color: T.sub, cursor: 'pointer', padding: '8px 16px' }}>+ Add a milestone</button>
      {!rowsValid && rows.some((row) => row.amount.length > 0) && <div role="alert" style={{ color: T.red, fontSize: 11, marginTop: 8 }}>Every milestone needs a positive {symbol} amount with no more than {decimals} decimal places.</div>}
      <div style={{ marginTop: 20, borderTop: `1px solid ${T.line}`, paddingTop: 14, fontSize: 12, color: T.sub }}>Quoted total <span style={{ fontFamily: mono, color: T.text }}>{money(total)}</span>{mode === 'USD' && price > 0n && <> · current funding <span style={{ fontFamily: mono, color: T.text }}>{formatUnits(fundingTotal, 18)} ETH</span></>}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}><button onClick={() => setStep(1)} style={btn('quiet')}>Back</button><button onClick={() => setStep(3)} disabled={!rowsValid} style={btn('primary', !rowsValid)}>Next: the rules</button></div>
    </div>}

    {step === 3 && <div style={panel}>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>The rules</div><div style={{ fontSize: 12, color: T.sub, marginBottom: 20 }}>The deployed contract permits review windows from {Number(minTimelock) / 3600} hour to {Number(maxTimelock) / 86400} days.</div>
      <div style={{ display: 'flex', gap: 10 }}>{(Object.keys(TIMELOCKS) as TimelockLabel[]).map((item) => <button key={item} onClick={() => setTimelock(item)} style={choice(timelock === item)}><span style={{ fontWeight: 500 }}>{item}</span></button>)}</div>
      <div style={{ marginTop: 18, border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.amber}`, padding: '12px 14px', fontSize: 12, color: T.sub }}>After submission, failing to approve, reject, or dispute within {timelock} allows anyone to trigger the freelancer payout.</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}><button onClick={() => setStep(2)} style={btn('quiet')}>Back</button><button onClick={() => setStep(4)} disabled={!timelockValid} style={btn('primary', !timelockValid)}>Review everything</button></div>
    </div>}

    {step === 4 && <div style={panel}>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>Check it, then fund it</div>
      <dl style={{ margin: '16px 0 18px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '9px 18px', fontSize: 13 }}><dt style={{ color: T.mut }}>Freelancer</dt><dd style={{ margin: 0, fontFamily: mono }}>{freelancer.trim()}</dd><dt style={{ color: T.mut }}>Arbitrator</dt><dd style={{ margin: 0, fontFamily: mono }}>{arbitrator.trim()}</dd><dt style={{ color: T.mut }}>Milestones</dt><dd style={{ margin: 0 }}>{amounts.map((amount, index) => `Milestone ${index + 1} (${money(amount)})`).join(' · ')}</dd><dt style={{ color: T.mut }}>Review window</dt><dd style={{ margin: 0 }}>{timelock}</dd><dt style={{ color: T.mut }}>Protocol fee</dt><dd style={{ margin: 0 }}>{Number(feeBps) / 100}% · {mode === 'USD' ? `${formatUnits(feeTotal, 18)} ETH at current quote` : money(feeTotal)}</dd><dt style={{ color: T.mut }}>Freelancer net</dt><dd style={{ margin: 0 }}>{mode === 'USD' ? `${formatUnits(fundingTotal - feeTotal, 18)} ETH at current quote` : money(total - feeTotal)}</dd></dl>
      {mode === 'USD' && <div style={{ border: `1px solid ${quoteStale ? T.red : T.line}`, padding: '12px 14px', marginBottom: 18, fontSize: 12, color: T.sub }}>Chainlink quote: {price > 0n ? `$${formatUnits(price, 8)} per ETH` : 'unavailable'} · updated {quoteTimestamp ? new Date(quoteTimestamp * 1000).toLocaleString() : 'unknown'} · {quoteStale ? 'stale—submission disabled' : `${quoteAge}s old`}. The quote is read again immediately before simulation and signing.</div>}
      {mode === 'USDC' && <div style={{ border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.blue}`, padding: '14px 16px', marginBottom: 18 }}><div style={{ fontSize: 12, color: T.sub, marginBottom: 10 }}>USDC reports {Number(usdcDecimals)} decimals. Current allowance: {displayAmount(allowance, Number(usdcDecimals), 'USDC')}. Approval and creation are separate confirmed transactions; either step can be retried safely.</div><TxButton label={approved ? 'Allowance confirmed ✓' : `Approve ${money(total)} (1 of 2)`} fn="USDC.approve(escrow, exact amount)" kind="primary" disabled={approved || total === 0n} phase={approved ? 'success' : approval.phase} error={approval.error} onClick={() => void approval.approve(total)} onSuccess={() => { void refetchAllowance().finally(approval.reset); }} /></div>}
      {(quoteError || write.error) && <div role="alert" style={{ color: T.red, fontSize: 11, marginBottom: 12 }}>{quoteError || write.error}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><button onClick={() => { write.reset(); setStep(3); }} style={btn('quiet')}>Back</button><TxButton label={mode === 'USDC' ? `Create with ${money(total)} (2 of 2)` : mode === 'USD' ? `Fund ${formatUnits(fundingTotal, 18)} ETH & create` : `Fund ${money(total)} & create`} fn={mode === 'USD' ? 'createJobUsd(…)' : 'createJob(…)'} kind="green" disabled={!client || !rowsValid || (mode === 'USDC' && !approved) || (mode === 'USD' && (quoteStale || price <= 0n))} phase={write.phase} error={write.error} onClick={() => void create()} onSuccess={() => nav('/jobs')} /></div>
    </div>}
  </main>;
}
