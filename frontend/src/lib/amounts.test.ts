import { describe, expect, it } from 'vitest';
import { feeAmount, parseExactAmount, sumAmounts, usdAmountsToWei } from './amounts';

describe('exact transaction amounts', () => {
  it('parses ETH, USDC, and USD without floating point', () => {
    expect(parseExactAmount('0.100000000000000001', 18)).toBe(100000000000000001n);
    expect(parseExactAmount('12.345678', 6)).toBe(12345678n);
    expect(parseExactAmount('500.25', 8)).toBe(50025000000n);
  });

  it('rejects exponent notation, negatives, and excess precision', () => {
    expect(parseExactAmount('1e3', 6)).toBeNull();
    expect(parseExactAmount('-1', 6)).toBeNull();
    expect(parseExactAmount('1.0000001', 6)).toBeNull();
  });

  it('matches the contract USD conversion per milestone', () => {
    const wei = usdAmountsToWei([50000000000n, 25000000000n], 200000000000n);
    expect(wei).toEqual([250000000000000000n, 125000000000000000n]);
    expect(sumAmounts(wei)).toBe(375000000000000000n);
  });

  it('calculates fees using integer basis points', () => {
    expect(feeAmount(1000001n, 100n)).toBe(10000n);
  });
});
