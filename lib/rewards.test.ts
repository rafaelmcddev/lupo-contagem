import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CASHBACK_EXPIRY_DAYS,
  DEFAULT_CASHBACK_MAX_USAGE_PERCENT,
  DEFAULT_CASHBACK_PERCENT,
  calculateExpiresAt,
  calculateMinPurchaseToUseCents,
  calculateRewardCents,
} from './rewards';

describe('calculateRewardCents', () => {
  it('returns the given percent of the value, rounded to the nearest cent', () => {
    expect(calculateRewardCents(4590, 5)).toBe(230); // 229.5 -> 230
    expect(calculateRewardCents(10000, 5)).toBe(500);
    expect(calculateRewardCents(1, 5)).toBe(0); // 0.05 -> 0
  });

  it('supports a store-specific percent', () => {
    expect(calculateRewardCents(10000, 10)).toBe(1000);
  });

  it('defaults to 5%', () => {
    expect(DEFAULT_CASHBACK_PERCENT).toBe(5);
  });
});

describe('calculateExpiresAt', () => {
  it('becomes usable 3 days after the purchase and stays usable for the given number of days from there', () => {
    // Sept 30 purchase, 30-day window -> usable from Oct 3, expires Nov 2.
    expect(calculateExpiresAt('2026-09-30', 30)).toBe('2026-11-02');
  });

  it('handles a same-month case too', () => {
    // Sept 14 purchase, 30-day window -> usable Sept 17, expires Oct 17.
    expect(calculateExpiresAt('2026-09-14', 30)).toBe('2026-10-17');
  });

  it('supports a store-specific expiry', () => {
    expect(calculateExpiresAt('2026-09-14', 45)).toBe('2026-11-01');
  });

  it('defaults to 30 days', () => {
    expect(DEFAULT_CASHBACK_EXPIRY_DAYS).toBe(30);
  });
});

describe('calculateMinPurchaseToUseCents', () => {
  it('returns the smallest new-purchase value that lets the full reward be redeemed under the cap', () => {
    // R$5,00 reward, 20% cap -> needs at least a R$25,00 purchase.
    expect(calculateMinPurchaseToUseCents(500, 20)).toBe(2500);
  });

  it('rounds up so the cap is never technically exceeded', () => {
    expect(calculateMinPurchaseToUseCents(100, 30)).toBe(334); // 333.33... -> 334
  });

  it('defaults to 20%', () => {
    expect(DEFAULT_CASHBACK_MAX_USAGE_PERCENT).toBe(20);
  });
});
