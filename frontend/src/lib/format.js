import { formatEther, formatUnits } from 'viem';

export const isEth = (token) => !token || token === '0x0000000000000000000000000000000000000000';

export function fmtAmount(wei, token) {
  if (wei == null) return '—';
  return isEth(token)
    ? `${Number(formatEther(wei)).toFixed(4)} ETH`
    : `${Number(formatUnits(wei, 6)).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC`;
}

export const FEE_BPS = 100n; // 1% — keep in sync with the contract
export const net = (wei) => wei - (wei * FEE_BPS) / 10000n;
export const fee = (wei) => (wei * FEE_BPS) / 10000n;

export function countdown(submittedAt, timelockSecs, now = Date.now()) {
  const end = (submittedAt + timelockSecs) * 1000;
  const remain = Math.max(0, Math.floor((end - now) / 1000));
  const d = Math.floor(remain / 86400), h = Math.floor((remain % 86400) / 3600),
    m = Math.floor((remain % 3600) / 60), s = remain % 60;
  const p = (n) => String(n).padStart(2, '0');
  return { expired: remain === 0, text: `${d}d ${p(h)}:${p(m)}:${p(s)}`, long: `${d} days ${h} hours` };
}
