import { addDaysToIsoDate } from '@/lib/dates';

export function calculateRewardCents(valueCents: number): number {
  return Math.round(valueCents * 0.05);
}

export function calculateExpiresAt(saleDate: string): string {
  return addDaysToIsoDate(saleDate, 30);
}
