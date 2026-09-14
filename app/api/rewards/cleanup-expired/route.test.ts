import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { cashbackCleanupLog, customers, sales } from '@/db/schema';
import { addDaysToIsoDate, todayIso } from '@/lib/dates';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { POST } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

async function createSale(daysAgo: number, cashbackUsed = false) {
  const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '1' }).returning();
  const [sale] = await db
    .insert(sales)
    .values({ storeId, customerId: customer.id, saleDate: addDaysToIsoDate(todayIso(), -daysAgo), valueCents: 1000, cashbackUsed })
    .returning();
  return sale;
}

function postReq() {
  return unlockedRequest('http://localhost', storeId, { method: 'POST' });
}

describe('POST /api/rewards/cleanup-expired', () => {
  it('returns 401 when the PIN is not unlocked', async () => {
    const res = await POST(storeRequest('http://localhost', storeId, { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('deletes a sale that expired 30+ days ago, regardless of cashback_used', async () => {
    const expiredUsed = await createSale(31, true);
    const expiredUnused = await createSale(35, false);
    const res = await POST(postReq());
    const data = await res.json();
    expect(data.rowsDeleted).toBe(2);
    const remaining = await db.select().from(sales);
    expect(remaining.map((s) => s.id)).not.toContain(expiredUsed.id);
    expect(remaining.map((s) => s.id)).not.toContain(expiredUnused.id);
  });

  it('leaves a sale that has not expired yet', async () => {
    const notExpired = await createSale(20);
    await POST(postReq());
    const remaining = await db.select().from(sales);
    expect(remaining.map((s) => s.id)).toContain(notExpired.id);
  });

  it('only deletes sales from the requesting store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const [customer] = await db.insert(customers).values({ storeId: otherStoreId, name: 'Bia', phone: '1' }).returning();
    const [otherSale] = await db
      .insert(sales)
      .values({ storeId: otherStoreId, customerId: customer.id, saleDate: addDaysToIsoDate(todayIso(), -40), valueCents: 1000 })
      .returning();
    await POST(postReq());
    const remaining = await db.select().from(sales);
    expect(remaining.map((s) => s.id)).toContain(otherSale.id);
  });

  it('logs a cleanup run with the exact count deleted', async () => {
    await createSale(31);
    await createSale(40);
    await POST(postReq());
    const [log] = await db.select().from(cashbackCleanupLog);
    expect(log.rowsDeleted).toBe(2);
    expect(log.storeId).toBe(storeId);
  });

  it('still logs a run (with rowsDeleted: 0) when nothing was expired', async () => {
    await POST(postReq());
    const [log] = await db.select().from(cashbackCleanupLog);
    expect(log.rowsDeleted).toBe(0);
  });

  it('deletes a sale that hit exactly 30 days — the boundary is inclusive', async () => {
    const exactlyThirty = await createSale(30);
    const res = await POST(postReq());
    const data = await res.json();
    expect(data.rowsDeleted).toBe(1);
    const remaining = await db.select().from(sales);
    expect(remaining.map((s) => s.id)).not.toContain(exactlyThirty.id);
  });
});
