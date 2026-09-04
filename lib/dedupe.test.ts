import { describe, expect, it } from 'vitest';
import { isDuplicateScan } from './dedupe';

describe('isDuplicateScan', () => {
  it('is not a duplicate when there is no previous scan', () => {
    expect(isDuplicateScan(null, null, '123', new Date())).toBe(false);
  });

  it('is a duplicate when the same barcode repeats within the window', () => {
    const last = new Date('2026-01-01T10:00:00.000Z');
    const now = new Date('2026-01-01T10:00:00.500Z');
    expect(isDuplicateScan(last, '123', '123', now)).toBe(true);
  });

  it('is not a duplicate after the window elapses', () => {
    const last = new Date('2026-01-01T10:00:00.000Z');
    const now = new Date('2026-01-01T10:00:02.000Z');
    expect(isDuplicateScan(last, '123', '123', now)).toBe(false);
  });

  it('is not a duplicate when the barcode differs', () => {
    const last = new Date('2026-01-01T10:00:00.000Z');
    const now = new Date('2026-01-01T10:00:00.100Z');
    expect(isDuplicateScan(last, '123', '456', now)).toBe(false);
  });
});
