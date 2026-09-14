import { describe, expect, it } from 'vitest';
import { StoreNotSelectedError, getStoreIdFromRequest } from './store';

function reqWithCookie(cookie: string | null) {
  const headers = new Headers();
  if (cookie !== null) headers.set('cookie', cookie);
  return new Request('http://localhost', { headers });
}

describe('getStoreIdFromRequest', () => {
  it('reads the store_id cookie', () => {
    expect(getStoreIdFromRequest(reqWithCookie('store_id=2'))).toBe(2);
  });

  it('finds store_id among other cookies', () => {
    expect(getStoreIdFromRequest(reqWithCookie('foo=bar; store_id=5; other=1'))).toBe(5);
  });

  it('throws StoreNotSelectedError when there is no cookie header at all', () => {
    expect(() => getStoreIdFromRequest(reqWithCookie(null))).toThrow(StoreNotSelectedError);
  });

  it('throws StoreNotSelectedError when store_id is missing among other cookies', () => {
    expect(() => getStoreIdFromRequest(reqWithCookie('foo=bar'))).toThrow(StoreNotSelectedError);
  });

  it('throws StoreNotSelectedError when store_id is not a number', () => {
    expect(() => getStoreIdFromRequest(reqWithCookie('store_id=abc'))).toThrow(StoreNotSelectedError);
  });
});
