import { describe, expect, it } from 'vitest';
import { countdown, fee, net } from './format';

describe('amount and timer helpers', () => {
  it('uses the one-percent protocol fee without losing integer precision', () => {
    expect(fee(10_000n)).toBe(100n);
    expect(net(10_000n)).toBe(9_900n);
  });

  it('marks elapsed review windows as expired', () => {
    expect(countdown(100, 60, 161_000)).toMatchObject({ expired: true, text: '0d 00:00:00' });
  });
});
