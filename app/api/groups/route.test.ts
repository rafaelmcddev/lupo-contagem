import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { GET, POST } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

function postReq(body: unknown) {
  return storeRequest('http://localhost/api/groups', storeId, { method: 'POST', body: JSON.stringify(body) });
}

describe('/api/groups', () => {
  it('starts empty', async () => {
    const res = await GET(storeRequest('http://localhost/api/groups', storeId));
    const data = await res.json();
    expect(data.groups).toEqual([]);
  });

  it('creates a group', async () => {
    const res = await POST(postReq({ prefix: '789123', name: 'Cueca Slip Preta' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.group.prefix).toBe('789123');
  });

  it('rejects a duplicate prefix', async () => {
    await POST(postReq({ prefix: '789123', name: 'A' }));
    const res = await POST(postReq({ prefix: '789123', name: 'B' }));
    expect(res.status).toBe(409);
  });

  it('allows the same prefix to be registered in a different store', async () => {
    await POST(postReq({ prefix: '789123', name: 'A' }));
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const res = await POST(
      storeRequest('http://localhost/api/groups', otherStoreId, {
        method: 'POST',
        body: JSON.stringify({ prefix: '789123', name: 'B' }),
      }),
    );
    expect(res.status).toBe(201);
  });

  it('only lists groups from the current store', async () => {
    await POST(postReq({ prefix: '111', name: 'Loja atual' }));
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await POST(
      storeRequest('http://localhost/api/groups', otherStoreId, {
        method: 'POST',
        body: JSON.stringify({ prefix: '222', name: 'Outra loja' }),
      }),
    );

    const res = await GET(storeRequest('http://localhost/api/groups', storeId));
    const data = await res.json();
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0].name).toBe('Loja atual');
  });

  it('rejects an empty name', async () => {
    const res = await POST(postReq({ prefix: '1', name: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 invalid_json when the body is malformed', async () => {
    const res = await POST(storeRequest('http://localhost/api/groups', storeId, { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_json');
  });
});
