import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { POST } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function verifyReq(pin: string, id = storeId) {
  return storeRequest('http://localhost', id, { method: 'POST', body: JSON.stringify({ pin }) });
}

describe('/api/sale-pin/verify', () => {
  it('returns ok when the pin matches the env var for the current store', async () => {
    vi.stubEnv('SALE_PIN_COXIM_MS', '1234');
    const res = await POST(verifyReq('1234'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('returns 401 invalid_pin when the pin does not match', async () => {
    vi.stubEnv('SALE_PIN_COXIM_MS', '1234');
    const res = await POST(verifyReq('0000'));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('invalid_pin');
  });

  it('returns 401 invalid_pin when the store has no pin configured', async () => {
    const res = await POST(verifyReq('anything'));
    expect(res.status).toBe(401);
  });

  it('checks the pin against the correct store — a pin valid for one store does not unlock another', async () => {
    vi.stubEnv('SALE_PIN_COXIM_MS', '1234');
    vi.stubEnv('SALE_PIN_CAMPO_GRANDE_MS', '5678');
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const res = await POST(verifyReq('1234', otherStoreId));
    expect(res.status).toBe(401);
  });

  it('returns 400 invalid_json when the body is malformed', async () => {
    const res = await POST(storeRequest('http://localhost', storeId, { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });
});
