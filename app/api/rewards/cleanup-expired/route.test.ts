import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { cashbackCleanupLog, customers, sales, stores } from '@/db/schema';
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

  it('deletes an expired sale whose cashback was never used', async () => {
    const expiredUnused = await createSale(35, false);
    const res = await POST(postReq());
    const data = await res.json();
    expect(data.rowsDeleted).toBe(1);
    const remaining = await db.select().from(sales);
    expect(remaining.map((s) => s.id)).not.toContain(expiredUnused.id);
  });

  it('never deletes a sale whose cashback was used, even long after it expired', async () => {
    const expiredUsed = await createSale(31, true);
    const res = await POST(postReq());
    const data = await res.json();
    expect(data.rowsDeleted).toBe(0);
    const remaining = await db.select().from(sales);
    expect(remaining.map((s) => s.id)).toContain(expiredUsed.id);
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
    await createSale(33);
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

  it('uses the store-specific expiry (not the 30-day default) to decide what is expired', async () => {
    await db.update(stores).set({ cashbackExpiryDays: 60 }).where(eq(stores.id, storeId));
    const stillValid = await createSale(35); // past the 30-day default, but not this store's 60-day expiry
    const res = await POST(postReq());
    const data = await res.json();
    expect(data.rowsDeleted).toBe(0);
    const remaining = await db.select().from(sales);
    expect(remaining.map((s) => s.id)).toContain(stillValid.id);
  });

  it('deletes a sale that hit exactly the true expiry boundary (33 days: 30 configured + 3-day delay) — inclusive', async () => {
    const exactlyExpired = await createSale(33);
    const res = await POST(postReq());
    const data = await res.json();
    expect(data.rowsDeleted).toBe(1);
    const remaining = await db.select().from(sales);
    expect(remaining.map((s) => s.id)).not.toContain(exactlyExpired.id);
  });
});
