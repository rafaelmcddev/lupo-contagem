import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { cashbackCleanupLog } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { GET } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

describe('GET /api/rewards/cleanup-log', () => {
  it('returns 401 when the PIN is not unlocked', async () => {
    const res = await GET(storeRequest('http://localhost', storeId));
    expect(res.status).toBe(401);
  });

  it('lists this store\'s cleanup runs, newest first', async () => {
    await db.insert(cashbackCleanupLog).values({ storeId, rowsDeleted: 2 });
    await new Promise((r) => setTimeout(r, 5));
    await db.insert(cashbackCleanupLog).values({ storeId, rowsDeleted: 5 });
    const res = await GET(unlockedRequest('http://localhost', storeId));
    const data = await res.json();
    expect(data.log).toHaveLength(2);
    expect(data.log[0].rowsDeleted).toBe(5);
  });

  it('does not include another store\'s cleanup runs', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await db.insert(cashbackCleanupLog).values({ storeId: otherStoreId, rowsDeleted: 9 });
    const res = await GET(unlockedRequest('http://localhost', storeId));
    const data = await res.json();
    expect(data.log).toHaveLength(0);
  });
});
