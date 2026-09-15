import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { groups } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { DELETE, PUT } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

async function createGroup(overrideStoreId = storeId) {
  const [row] = await db.insert(groups).values({ storeId: overrideStoreId, prefix: '789123', name: 'Cueca Slip Preta' }).returning();
  return row;
}

describe('/api/groups/:id', () => {
  it('returns 401 when the PIN is not unlocked', async () => {
    const putRes = await PUT(storeRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ name: 'X' }) }), {
      params: { id: '1' },
    });
    expect(putRes.status).toBe(401);
    const deleteRes = await DELETE(storeRequest('http://localhost', storeId, { method: 'DELETE' }), { params: { id: '1' } });
    expect(deleteRes.status).toBe(401);
  });

  it('renames a group', async () => {
    const group = await createGroup();
    const res = await PUT(
      unlockedRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ name: 'Novo nome' }) }),
      { params: { id: String(group.id) } },
    );
    const data = await res.json();
    expect(data.group.name).toBe('Novo nome');
  });

  it('returns 404 when renaming a group that does not exist', async () => {
    const res = await PUT(
      unlockedRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ name: 'X' }) }),
      { params: { id: '999999' } },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when renaming a group that belongs to a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const group = await createGroup(otherStoreId);
    const res = await PUT(
      unlockedRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ name: 'X' }) }),
      { params: { id: String(group.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('deletes a group', async () => {
    const group = await createGroup();
    const res = await DELETE(unlockedRequest('http://localhost', storeId, { method: 'DELETE' }), {
      params: { id: String(group.id) },
    });
    expect(res.status).toBe(200);
  });

  it('returns 404 when deleting a group that belongs to a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const group = await createGroup(otherStoreId);
    const res = await DELETE(unlockedRequest('http://localhost', storeId, { method: 'DELETE' }), {
      params: { id: String(group.id) },
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-integer id on PUT instead of throwing', async () => {
    const res = await PUT(unlockedRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ name: 'X' }) }), {
      params: { id: 'abc' },
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-integer id on DELETE instead of throwing', async () => {
    const res = await DELETE(unlockedRequest('http://localhost', storeId, { method: 'DELETE' }), { params: { id: 'abc' } });
    expect(res.status).toBe(404);
  });

  it('returns 400 invalid_json when the PUT body is malformed', async () => {
    const group = await createGroup();
    const res = await PUT(unlockedRequest('http://localhost', storeId, { method: 'PUT', body: '{not json' }), {
      params: { id: String(group.id) },
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_json');
  });
});
