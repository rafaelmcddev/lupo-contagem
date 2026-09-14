import { describe, expect, it } from 'vitest';
import { addDaysToIsoDate, formatDateBR, todayIso } from './dates';

describe('formatDateBR', () => {
  it('converts an ISO date to DD/MM/YYYY', () => {
    expect(formatDateBR('2026-09-14')).toBe('14/09/2026');
  });

  it('pads single-digit day/month correctly (already zero-padded input)', () => {
    expect(formatDateBR('2026-01-05')).toBe('05/01/2026');
  });

  it('returns the input unchanged if it is not a recognizable ISO date', () => {
    expect(formatDateBR('not-a-date')).toBe('not-a-date');
  });
});

describe('addDaysToIsoDate', () => {
  it('adds days within the same month', () => {
    expect(addDaysToIsoDate('2026-09-01', 10)).toBe('2026-09-11');
  });

  it('rolls over into the next month', () => {
    expect(addDaysToIsoDate('2026-09-25', 10)).toBe('2026-10-05');
  });

  it('rolls over into the next year', () => {
    expect(addDaysToIsoDate('2026-12-28', 10)).toBe('2027-01-07');
  });
});

describe('todayIso', () => {
  it('returns a string matching YYYY-MM-DD', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
