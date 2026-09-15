import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { customers, sales } from '@/db/schema';
import { addDaysToIsoDate, todayIso } from '@/lib/dates';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { GET } from './route';

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

function getReq() {
  return unlockedRequest('http://localhost', storeId);
}

describe('GET /api/rewards/cleanup-expired-count', () => {
  it('returns 401 when the PIN is not unlocked', async () => {
    const res = await GET(storeRequest('http://localhost', storeId));
    expect(res.status).toBe(401);
  });

  it('counts only the expired sales whose cashback was never used', async () => {
    await createSale(31, true); // expired but used — must not count
    await createSale(40, false);
    await createSale(20);
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.count).toBe(1);
  });

  it('only counts sales from the requesting store', async () => {
    await createSale(40);
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const [otherCustomer] = await db.insert(customers).values({ storeId: otherStoreId, name: 'Bia', phone: '1' }).returning();
    await db.insert(sales).values({ storeId: otherStoreId, customerId: otherCustomer.id, saleDate: addDaysToIsoDate(todayIso(), -40), valueCents: 1000 });

    const res = await GET(getReq());
    const data = await res.json();
    expect(data.count).toBe(1);
  });
});
