import { storeRequest } from './testStores';

export function unlockedRequest(url: string, storeId: number, init: RequestInit = {}): Request {
  const withStore = storeRequest(url, storeId, init);
  const existingCookie = withStore.headers.get('cookie') ?? '';
  const headers = new Headers(withStore.headers);
  headers.set('cookie', `${existingCookie}; sale_pin_ok=${storeId}`);
  return new Request(url, { ...init, headers });
}
