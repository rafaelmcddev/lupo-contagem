import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { customers, sales } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { DELETE, PUT } from './route';

let storeId: number;
let customerId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
  const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '99999-0000' }).returning();
  customerId = customer.id;
});

async function createSale(overrideStoreId = storeId, overrideCustomerId = customerId) {
  const [row] = await db
    .insert(sales)
    .values({ storeId: overrideStoreId, customerId: overrideCustomerId, saleDate: '2026-09-14', valueCents: 4590 })
    .returning();
  return row;
}

function putReq(body: unknown) {
  return unlockedRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify(body) });
}

function deleteReq() {
  return unlockedRequest('http://localhost', storeId, { method: 'DELETE' });
}

describe('/api/sales/:id', () => {
  it('returns 401 sale_pin_required when the PIN is not unlocked', async () => {
    const sale = await createSale();
    const res = await PUT(storeRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ customerId, saleDate: '2026-09-14', valueCents: 100 }) }), {
      params: { id: String(sale.id) },
    });
    expect(res.status).toBe(401);
  });

  it('edits date and value', async () => {
    const sale = await createSale();
    const res = await PUT(putReq({ customerId, saleDate: '2026-01-01', valueCents: 1000 }), { params: { id: String(sale.id) } });
    const data = await res.json();
    expect(data.sale).toMatchObject({ saleDate: '2026-01-01', valueCents: 1000 });
  });

  it('returns 404 when editing a sale that belongs to a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const [otherCustomer] = await db.insert(customers).values({ storeId: otherStoreId, name: 'Outra loja', phone: '1' }).returning();
    const sale = await createSale(otherStoreId, otherCustomer.id);
    // Body's customerId must belong to the ACTING store (storeId), not the
    // sale's own store — otherwise the customer-ownership check (400
    // invalid_customer) fires before the sale-ownership check ever runs,
    // and this test would stop isolating the condition its name claims to.
    const res = await PUT(putReq({ customerId, saleDate: '2026-01-01', valueCents: 1000 }), { params: { id: String(sale.id) } });
    expect(res.status).toBe(404);
  });

  it('rejects an invalid value on edit', async () => {
    const sale = await createSale();
    const res = await PUT(putReq({ customerId, saleDate: '2026-01-01', valueCents: -5 }), { params: { id: String(sale.id) } });
    expect(res.status).toBe(400);
  });

  it('removes a sale', async () => {
    const sale = await createSale();
    const res = await DELETE(deleteReq(), { params: { id: String(sale.id) } });
    expect(res.status).toBe(200);
    const remaining = await db.select().from(sales);
    expect(remaining).toHaveLength(0);
  });

  it('returns 404 when removing a sale that belongs to a different store, leaving it intact', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const [otherCustomer] = await db.insert(customers).values({ storeId: otherStoreId, name: 'Outra loja', phone: '1' }).returning();
    const sale = await createSale(otherStoreId, otherCustomer.id);
    const res = await DELETE(deleteReq(), { params: { id: String(sale.id) } });
    expect(res.status).toBe(404);
    const remaining = await db.select().from(sales);
    expect(remaining).toHaveLength(1);
  });

  it('returns 404 for a non-integer id instead of throwing', async () => {
    const res = await PUT(putReq({ customerId, saleDate: '2026-01-01', valueCents: 1000 }), { params: { id: 'abc' } });
    expect(res.status).toBe(404);
  });

  it('toggles cashback_used on its own, without touching customer/date/value', async () => {
    const sale = await createSale();
    const res = await PUT(putReq({ cashbackUsed: true }), { params: { id: String(sale.id) } });
    const data = await res.json();
    expect(data.sale.cashbackUsed).toBe(true);
    expect(data.sale.customerId).toBe(sale.customerId);
    expect(data.sale.saleDate).toBe(sale.saleDate);
    expect(data.sale.valueCents).toBe(sale.valueCents);
  });

  it('toggles cashback_used back to false', async () => {
    const sale = await createSale();
    await PUT(putReq({ cashbackUsed: true }), { params: { id: String(sale.id) } });
    const res = await PUT(putReq({ cashbackUsed: false }), { params: { id: String(sale.id) } });
    const data = await res.json();
    expect(data.sale.cashbackUsed).toBe(false);
  });

  it('returns 404 toggling cashback_used on a sale from a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const [otherCustomer] = await db.insert(customers).values({ storeId: otherStoreId, name: 'Outra loja', phone: '1' }).returning();
    const sale = await createSale(otherStoreId, otherCustomer.id);
    const res = await PUT(putReq({ cashbackUsed: true }), { params: { id: String(sale.id) } });
    expect(res.status).toBe(404);
  });
});
