import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { customers } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { DELETE, PUT } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

async function createCustomer(overrideStoreId = storeId) {
  const [row] = await db.insert(customers).values({ storeId: overrideStoreId, name: 'Ana', phone: '99999-0000' }).returning();
  return row;
}

function putReq(body: unknown) {
  return unlockedRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify(body) });
}

function deleteReq() {
  return unlockedRequest('http://localhost', storeId, { method: 'DELETE' });
}

describe('/api/customers/:id', () => {
  it('returns 401 sale_pin_required when the PIN is not unlocked', async () => {
    const customer = await createCustomer();
    const res = await PUT(storeRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ name: 'X', phone: 'X' }) }), {
      params: { id: String(customer.id) },
    });
    expect(res.status).toBe(401);
  });

  it('edits name and phone', async () => {
    const customer = await createCustomer();
    const res = await PUT(putReq({ name: 'Ana Silva', phone: '98888-1111' }), { params: { id: String(customer.id) } });
    const data = await res.json();
    expect(data.customer).toMatchObject({ name: 'Ana Silva', phone: '98888-1111' });
  });

  it('returns 404 when editing a customer that does not exist', async () => {
    const res = await PUT(putReq({ name: 'X', phone: 'X' }), { params: { id: '999999' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 when editing a customer that belongs to a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const customer = await createCustomer(otherStoreId);
    const res = await PUT(putReq({ name: 'X', phone: 'X' }), { params: { id: String(customer.id) } });
    expect(res.status).toBe(404);
  });

  it('rejects an empty name or phone on edit', async () => {
    const customer = await createCustomer();
    const res = await PUT(putReq({ name: '', phone: '98888-1111' }), { params: { id: String(customer.id) } });
    expect(res.status).toBe(400);
  });

  it('removes a customer', async () => {
    const customer = await createCustomer();
    const res = await DELETE(deleteReq(), { params: { id: String(customer.id) } });
    expect(res.status).toBe(200);
    const remaining = await db.select().from(customers);
    expect(remaining).toHaveLength(0);
  });

  it('returns 404 when removing a customer that belongs to a different store, leaving it intact', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const customer = await createCustomer(otherStoreId);
    const res = await DELETE(deleteReq(), { params: { id: String(customer.id) } });
    expect(res.status).toBe(404);
    const remaining = await db.select().from(customers);
    expect(remaining).toHaveLength(1);
  });

  it('returns 404 for a non-integer id instead of throwing', async () => {
    const res = await PUT(putReq({ name: 'X', phone: 'X' }), { params: { id: 'abc' } });
    expect(res.status).toBe(404);
  });
});
