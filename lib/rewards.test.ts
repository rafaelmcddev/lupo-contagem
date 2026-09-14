import { describe, expect, it } from 'vitest';
import { calculateExpiresAt, calculateRewardCents } from './rewards';

describe('calculateRewardCents', () => {
  it('returns 5% of the value, rounded to the nearest cent', () => {
    expect(calculateRewardCents(4590)).toBe(230); // 229.5 -> 230
    expect(calculateRewardCents(10000)).toBe(500);
    expect(calculateRewardCents(1)).toBe(0); // 0.05 -> 0
  });
});

describe('calculateExpiresAt', () => {
  it('adds 30 days to the sale date', () => {
    expect(calculateExpiresAt('2026-09-14')).toBe('2026-10-14');
  });
});
