import { formatUnits, parseUnits } from 'viem';

const DECIMAL = /^(?:0|[1-9]\d*)(?:\.(\d+))?$/;

export function parseExactAmount(value: string, decimals: number): bigint | null {
  const normalized = value.trim();
  const match = DECIMAL.exec(normalized);
  if (!match || (match[1]?.length ?? 0) > decimals) return null;
  try { return parseUnits(normalized, decimals); }
  catch { return null; }
}

export const sumAmounts = (amounts: readonly bigint[]): bigint => amounts.reduce((sum, amount) => sum + amount, 0n);

export function feeAmount(total: bigint, feeBps: bigint): bigint {
  return (total * feeBps) / 10_000n;
}

export function usdAmountsToWei(amounts: readonly bigint[], price: bigint): bigint[] {
  if (price <= 0n) throw new Error('The ETH/USD quote must be positive.');
  return amounts.map((amount) => (amount * 10n ** 18n) / price);
}

export function displayAmount(amount: bigint, decimals: number, symbol: string): string {
  return `${formatUnits(amount, decimals)} ${symbol}`;
}
