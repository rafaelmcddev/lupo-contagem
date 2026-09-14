import { describe, expect, it } from 'vitest';
import { maskPhoneDigits } from './masks';

describe('maskPhoneDigits', () => {
  it('returns an empty string for no digits', () => {
    expect(maskPhoneDigits('')).toBe('');
  });

  it('formats progressively as digits are typed', () => {
    expect(maskPhoneDigits('6')).toBe('(6');
    expect(maskPhoneDigits('67')).toBe('(67)');
    expect(maskPhoneDigits('679')).toBe('(67) 9');
    expect(maskPhoneDigits('67999')).toBe('(67) 999');
    expect(maskPhoneDigits('6799912')).toBe('(67) 99912');
    expect(maskPhoneDigits('67999123')).toBe('(67) 99912-3');
    expect(maskPhoneDigits('67999123456')).toBe('(67) 99912-3456');
  });

  it('strips non-digit characters before formatting', () => {
    expect(maskPhoneDigits('(67) 99912-3456')).toBe('(67) 99912-3456');
  });

  it('truncates to 11 digits', () => {
    expect(maskPhoneDigits('679991234567890')).toBe('(67) 99912-3456');
  });
});
