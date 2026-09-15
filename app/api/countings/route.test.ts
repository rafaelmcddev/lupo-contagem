import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { settings } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { GET, POST } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

function postReq(body: unknown) {
  return unlockedRequest('http://localhost', storeId, { method: 'POST', body: JSON.stringify(body) });
}

function getReq(query = '') {
  return unlockedRequest(`http://localhost/api/countings${query}`, storeId);
}

describe('/api/countings', () => {
  it('returns 401 when the PIN is not unlocked', async () => {
    const getRes = await GET(storeRequest('http://localhost/api/countings', storeId));
    expect(getRes.status).toBe(401);
    const postRes = await POST(storeRequest('http://localhost', storeId, { method: 'POST', body: JSON.stringify({ name: 'X' }) }));
    expect(postRes.status).toBe(401);
  });

  it('creates a counting with the current prefix length frozen onto it', async () => {
    const res = await POST(postReq({ name: 'Entrega Lupo 03/09' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.counting.name).toBe('Entrega Lupo 03/09');
    expect(data.counting.status).toBe('active');
    expect(data.counting.prefixLengthUsed).toBe(7);
    expect(data.counting.requireSkuUsed).toBe(true);
  });

  it('freezes requireSkuUsed as false when the setting was turned off before creation', async () => {
    await db.insert(settings).values({ key: 'require_sku', value: 'false' });
    const res = await POST(postReq({ name: 'Sem SKU' }));
    const data = await res.json();
    expect(data.counting.requireSkuUsed).toBe(false);
  });

  it('rejects creating a counting without a name', async () => {
    const res = await POST(postReq({ name: '' }));
    expect(res.status).toBe(400);
  });

  it('lists only active countings when filtered', async () => {
    await POST(postReq({ name: 'A' }));
    const res = await GET(getReq('?status=active'));
    const data = await res.json();
    expect(data.countings).toHaveLength(1);
  });

  it('lists no finished countings when none have been finished', async () => {
    await POST(postReq({ name: 'A' }));
    const res = await GET(getReq('?status=finished'));
    const data = await res.json();
    expect(data.countings).toHaveLength(0);
  });

  it('paginates results and reports the total', async () => {
    for (let i = 1; i <= 3; i++) {
      await POST(postReq({ name: `Contagem ${i}` }));
    }
    const res = await GET(getReq('?pageSize=2&page=1'));
    const data = await res.json();
    expect(data.countings).toHaveLength(2);
    expect(data.total).toBe(3);
  });

  it('filters by name search', async () => {
    await POST(postReq({ name: 'Entrega Lupo' }));
    await POST(postReq({ name: 'Contagem geral' }));

    const res = await GET(getReq('?q=lupo'));
    const data = await res.json();
    expect(data.countings).toHaveLength(1);
    expect(data.countings[0].name).toBe('Entrega Lupo');
  });

  it('only lists countings from the current store', async () => {
    await POST(postReq({ name: 'Loja atual' }));
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await POST(unlockedRequest('http://localhost', otherStoreId, { method: 'POST', body: JSON.stringify({ name: 'Outra loja' }) }));

    const res = await GET(getReq());
    const data = await res.json();
    expect(data.countings).toHaveLength(1);
    expect(data.countings[0].name).toBe('Loja atual');
  });

  it('returns 400 invalid_json when the body is malformed', async () => {
    const res = await POST(unlockedRequest('http://localhost', storeId, { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_json');
  });
});
