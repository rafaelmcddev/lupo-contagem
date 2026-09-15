import { addDaysToIsoDate } from '@/lib/dates';

export const DEFAULT_CASHBACK_PERCENT = 5;
export const DEFAULT_CASHBACK_EXPIRY_DAYS = 30;
export const DEFAULT_CASHBACK_MAX_USAGE_PERCENT = 20;
// Cashback isn't usable on the purchase day, nor the days right after it —
// it becomes usable starting this many days later.
export const CASHBACK_USABLE_AFTER_DAYS = 3;

export function calculateRewardCents(valueCents: number, percent: number): number {
  return Math.round(valueCents * (percent / 100));
}

// Usable starting CASHBACK_USABLE_AFTER_DAYS after the purchase, and stays
// usable for `days` more days from there. So on a Sept 30 purchase with a
// 30-day window: usable Oct 3 through Nov 1 (30 days starting Oct 3), expiry
// shown/enforced as Nov 2 — the first day it's no longer valid.
export function calculateExpiresAt(saleDate: string, days: number): string {
  return addDaysToIsoDate(saleDate, days + CASHBACK_USABLE_AFTER_DAYS);
}

// A redemption can never cover more than `maxUsagePercent` of the NEW
// purchase it's applied to (protects margin against a purchase paid almost
// entirely with old credit). Returns the smallest new-purchase value that
// would let the customer redeem the full `rewardCents` without exceeding it.
export function calculateMinPurchaseToUseCents(rewardCents: number, maxUsagePercent: number): number {
  return Math.ceil(rewardCents / (maxUsagePercent / 100));
}
