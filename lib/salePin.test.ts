import { describe, expect, it } from 'vitest';
import { getSalePinEnvVarName, isSalePinUnlocked } from './salePin';

describe('getSalePinEnvVarName', () => {
  it('derives the env var name from a store slug', () => {
    expect(getSalePinEnvVarName('coxim-ms')).toBe('SALE_PIN_COXIM_MS');
    expect(getSalePinEnvVarName('campo-grande-ms')).toBe('SALE_PIN_CAMPO_GRANDE_MS');
  });
});

describe('isSalePinUnlocked', () => {
  function reqWithCookie(cookie: string | null) {
    const headers = new Headers();
    if (cookie !== null) headers.set('cookie', cookie);
    return new Request('http://localhost', { headers });
  }

  it('returns true when sale_pin_ok matches the given storeId', () => {
    expect(isSalePinUnlocked(reqWithCookie('sale_pin_ok=1'), 1)).toBe(true);
  });

  it('returns false when sale_pin_ok belongs to a different store', () => {
    expect(isSalePinUnlocked(reqWithCookie('sale_pin_ok=2'), 1)).toBe(false);
  });

  it('returns false when there is no sale_pin_ok cookie', () => {
    expect(isSalePinUnlocked(reqWithCookie('store_id=1'), 1)).toBe(false);
  });

  it('returns false when there is no cookie header at all', () => {
    expect(isSalePinUnlocked(reqWithCookie(null), 1)).toBe(false);
  });

  it('finds sale_pin_ok among other cookies', () => {
    expect(isSalePinUnlocked(reqWithCookie('store_id=1; sale_pin_ok=1; other=x'), 1)).toBe(true);
  });
});
