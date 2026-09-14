import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { GET, POST } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

function getReq(query = '') {
  return unlockedRequest(`http://localhost/api/customers${query}`, storeId);
}

function postReq(body: unknown) {
  return unlockedRequest('http://localhost/api/customers', storeId, { method: 'POST', body: JSON.stringify(body) });
}

describe('/api/customers', () => {
  it('returns 401 sale_pin_required when the PIN is not unlocked', async () => {
    const res = await GET(storeRequest('http://localhost/api/customers', storeId));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('sale_pin_required');
  });

  it('starts empty', async () => {
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.customers).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('creates a customer', async () => {
    const res = await POST(postReq({ name: 'Ana', phone: '99999-0000' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.customer).toMatchObject({ name: 'Ana', phone: '99999-0000' });
  });

  it('rejects an empty name or phone', async () => {
    const res = await POST(postReq({ name: '', phone: '99999-0000' }));
    expect(res.status).toBe(400);
  });

  it('allows duplicate phone numbers', async () => {
    await POST(postReq({ name: 'Ana', phone: '99999-0000' }));
    const res = await POST(postReq({ name: 'Outra Ana', phone: '99999-0000' }));
    expect(res.status).toBe(201);
  });

  it('filters by a search term across name and phone', async () => {
    await POST(postReq({ name: 'Ana Silva', phone: '99999-0000' }));
    await POST(postReq({ name: 'Bia Souza', phone: '98888-1111' }));

    const byName = await GET(getReq('?q=ana'));
    expect((await byName.json()).customers).toHaveLength(1);

    const byPhone = await GET(getReq('?q=98888'));
    expect((await byPhone.json()).customers).toHaveLength(1);
  });

  it('only lists customers from the current store', async () => {
    await POST(postReq({ name: 'Loja atual', phone: '99999-0000' }));
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await POST(unlockedRequest('http://localhost/api/customers', otherStoreId, { method: 'POST', body: JSON.stringify({ name: 'Outra loja', phone: '1' }) }));

    const res = await GET(getReq());
    const data = await res.json();
    expect(data.customers).toHaveLength(1);
    expect(data.customers[0].name).toBe('Loja atual');
  });

  it('paginates results', async () => {
    for (let i = 1; i <= 3; i++) {
      await POST(postReq({ name: `Cliente ${i}`, phone: String(i) }));
    }
    const res = await GET(getReq('?pageSize=2&page=1'));
    const data = await res.json();
    expect(data.customers).toHaveLength(2);
    expect(data.total).toBe(3);
  });

  it('returns 400 invalid_json when the body is malformed', async () => {
    const res = await POST(unlockedRequest('http://localhost/api/customers', storeId, { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });
});
