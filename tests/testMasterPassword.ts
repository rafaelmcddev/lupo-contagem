import { storeRequest } from './testStores';

export function masterUnlockedRequest(url: string, storeId: number, init: RequestInit = {}): Request {
  const withStore = storeRequest(url, storeId, init);
  const existingCookie = withStore.headers.get('cookie') ?? '';
  const headers = new Headers(withStore.headers);
  headers.set('cookie', `${existingCookie}; settings_master_ok=1`);
  return new Request(url, { ...init, headers });
}
