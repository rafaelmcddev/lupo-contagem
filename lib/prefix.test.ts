import { describe, expect, it } from 'vitest';
import { extractPrefix, isValidBarcode } from './prefix';

describe('extractPrefix', () => {
  it('returns the first N digits', () => {
    expect(extractPrefix('7891234567890', 7)).toBe('7891234');
  });
});

describe('isValidBarcode', () => {
  it('accepts a numeric barcode long enough for the prefix', () => {
    expect(isValidBarcode('7891234567890', 7)).toBe(true);
  });

  it('rejects a barcode shorter than the prefix length', () => {
    expect(isValidBarcode('123', 7)).toBe(false);
  });

  it('rejects a non-numeric barcode', () => {
    expect(isValidBarcode('abc1234', 3)).toBe(false);
  });
});
