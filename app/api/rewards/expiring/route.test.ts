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

async function createSale(daysAgo: number, valueCents = 10000, cashbackUsed = false) {
  const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '99999-0000' }).returning();
  const [sale] = await db
    .insert(sales)
    .values({ storeId, customerId: customer.id, saleDate: addDaysToIsoDate(todayIso(), -daysAgo), valueCents, cashbackUsed })
    .returning();
  return sale;
}

function getReq(query = '') {
  return unlockedRequest(`http://localhost/api/rewards/expiring${query}`, storeId);
}

describe('GET /api/rewards/expiring', () => {
  it('returns 401 when the PIN is not unlocked', async () => {
    const res = await GET(storeRequest('http://localhost', storeId));
    expect(res.status).toBe(401);
  });

  it('includes a sale expiring within the default 10-day window (sold 25 days ago, expires in 5)', async () => {
    const sale = await createSale(25);
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.items.map((i: any) => i.id)).toContain(sale.id);
  });

  it('excludes a sale expiring well outside the default window (sold yesterday, expires in 29 days)', async () => {
    const sale = await createSale(1);
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.items.map((i: any) => i.id)).not.toContain(sale.id);
  });

  it('computes rewardCents as 5% of valueCents and expiresAt as saleDate+30', async () => {
    const sale = await createSale(25, 10000);
    const res = await GET(getReq());
    const data = await res.json();
    const item = data.items.find((i: any) => i.id === sale.id);
    expect(item.rewardCents).toBe(500);
    expect(item.expiresAt).toBe(addDaysToIsoDate(sale.saleDate, 30));
  });

  it('filters by cashbackUsed=false, excluding used sales', async () => {
    const used = await createSale(25, 10000, true);
    const unused = await createSale(25, 10000, false);
    const res = await GET(getReq('?cashbackUsed=false'));
    const data = await res.json();
    const ids = data.items.map((i: any) => i.id);
    expect(ids).toContain(unused.id);
    expect(ids).not.toContain(used.id);
  });

  it('filters by cashbackUsed=true, including only used sales', async () => {
    const used = await createSale(25, 10000, true);
    const unused = await createSale(25, 10000, false);
    const res = await GET(getReq('?cashbackUsed=true'));
    const data = await res.json();
    const ids = data.items.map((i: any) => i.id);
    expect(ids).toContain(used.id);
    expect(ids).not.toContain(unused.id);
  });

  it('respects an explicit from/to expiry-date range', async () => {
    const farOut = await createSale(0); // expires in 30 days
    const res = await GET(getReq(`?from=${addDaysToIsoDate(todayIso(), 29)}&to=${addDaysToIsoDate(todayIso(), 31)}`));
    const data = await res.json();
    expect(data.items.map((i: any) => i.id)).toContain(farOut.id);
  });

  it('paginates and sorts by sale date descending', async () => {
    const older = await createSale(25, 10000);
    await new Promise((r) => setTimeout(r, 5));
    const newer = await createSale(20, 10000);
    const res = await GET(getReq('?pageSize=1&page=1'));
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    expect(data.total).toBe(2);
    expect(data.items[0].id).toBe(newer.id);
  });

  it('only returns sales from the requesting store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const [customer] = await db.insert(customers).values({ storeId: otherStoreId, name: 'Bia', phone: '1' }).returning();
    await db.insert(sales).values({ storeId: otherStoreId, customerId: customer.id, saleDate: addDaysToIsoDate(todayIso(), -25), valueCents: 5000 });
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.items).toHaveLength(0);
  });
});
