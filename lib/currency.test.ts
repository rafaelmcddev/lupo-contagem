import { describe, expect, it } from 'vitest';
import { formatCentsAsBRL } from './currency';

describe('formatCentsAsBRL', () => {
  it('formats cents as a BRL currency string with two decimals', () => {
    expect(formatCentsAsBRL(4590)).toBe('R$ 45,90');
  });

  it('formats a value under one real', () => {
    expect(formatCentsAsBRL(50)).toBe('R$ 0,50');
  });

  it('adds a thousands separator for large values', () => {
    expect(formatCentsAsBRL(123456789)).toBe('R$ 1.234.567,89');
  });

  it('formats zero', () => {
    expect(formatCentsAsBRL(0)).toBe('R$ 0,00');
  });
});
