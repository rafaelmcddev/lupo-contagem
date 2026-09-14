import { describe, expect, it } from 'vitest';
import { formatDateBR } from './dates';

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
