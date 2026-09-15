import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { customers, sales, stores, whatsappSends } from '@/db/schema';
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

describe('POST /api/sales/:id/send-reminder', () => {
  it('returns 401 when the PIN is not unlocked', async () => {
    const res = await POST(storeRequest('http://localhost', storeId, { method: 'POST' }), { params: { id: String(saleId) } });
    expect(res.status).toBe(401);
  });

  it('returns the phone and ready-to-send message text — the URL itself is built client-side (device-dependent)', async () => {
    const res = await POST(postReq(), { params: { id: String(saleId) } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.phone).toBe('99999-0000');
    expect(data.message).toContain('Ana');

    const [row] = await db.select().from(whatsappSends);
    expect(row).toMatchObject({ saleId, type: 'reminder', status: 'opened', trigger: 'manual' });
  });

  it('works even when the sale is well within its 30-day window (not gated by day 25)', async () => {
    const res = await POST(postReq(), { params: { id: String(saleId) } }); // saleDate is today, day 0
    expect(res.status).toBe(200);
  });

  it('returns 404 for a sale in a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const res = await POST(unlockedRequest('http://localhost', otherStoreId, { method: 'POST' }), {
      params: { id: String(saleId) },
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-integer id instead of throwing', async () => {
    const res = await POST(postReq(), { params: { id: 'abc' } });
    expect(res.status).toBe(404);
  });

  it('fills the store-specific template with the store name and its own percent/expiry', async () => {
    await db
      .update(stores)
      .set({ cashbackPercent: 10, cashbackExpiryDays: 45, whatsappMessageTemplate: 'Oi %nome%, %cashback% de %loja% vale até %data_limite%' })
      .where(eq(stores.id, storeId));

    const res = await POST(postReq(), { params: { id: String(saleId) } });
    const data = await res.json();
    expect(data.message).toContain('Oi Ana,');
    expect(data.message).toContain('R$ 10,00 de Coxim-MS vale até');
  });
});
