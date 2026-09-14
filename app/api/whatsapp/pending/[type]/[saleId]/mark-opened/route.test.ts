import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { customers, sales, whatsappSends } from '@/db/schema';
import { todayIso } from '@/lib/dates';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { POST } from './route';

let storeId: number;
let saleId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
  const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '99999-0000' }).returning();
  const [sale] = await db
    .insert(sales)
    .values({ storeId, customerId: customer.id, saleDate: todayIso(), valueCents: 10000 })
    .returning();
  saleId = sale.id;
});

function postReq() {
  return unlockedRequest('http://localhost', storeId, { method: 'POST' });
}

describe('POST /api/whatsapp/pending/:type/:saleId/mark-opened', () => {
  it('returns 401 when the PIN is not unlocked', async () => {
    const res = await POST(storeRequest('http://localhost', storeId, { method: 'POST' }), {
      params: { type: 'purchase', saleId: String(saleId) },
    });
    expect(res.status).toBe(401);
  });

  it('logs the item as opened, with trigger=queue', async () => {
    const res = await POST(postReq(), { params: { type: 'purchase', saleId: String(saleId) } });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(whatsappSends);
    expect(row).toMatchObject({ saleId, type: 'purchase', status: 'opened', trigger: 'queue' });
  });

  it('returns 404 for a sale that does not belong to this store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const res = await POST(unlockedRequest('http://localhost', otherStoreId, { method: 'POST' }), {
      params: { type: 'reminder', saleId: String(saleId) },
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid type', async () => {
    const res = await POST(postReq(), { params: { type: 'bogus', saleId: String(saleId) } });
    expect(res.status).toBe(400);
  });
});
