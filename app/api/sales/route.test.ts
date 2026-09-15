import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/client';
import { customers, stores, whatsappSends } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { GET, POST } from './route';

let storeId: number;
let customerId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
  const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '99999-0000' }).returning();
  customerId = customer.id;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function getReq(query = '') {
  return unlockedRequest(`http://localhost/api/sales${query}`, storeId);
}

function postReq(body: unknown) {
  return unlockedRequest('http://localhost/api/sales', storeId, { method: 'POST', body: JSON.stringify(body) });
}

describe('/api/sales', () => {
  it('returns 401 sale_pin_required when the PIN is not unlocked', async () => {
    const res = await GET(storeRequest('http://localhost/api/sales', storeId));
    expect(res.status).toBe(401);
  });

  it('starts empty', async () => {
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.sales).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('includes cashbackUsed in the listed sales', async () => {
    await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 10000 }));
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.sales[0]).toMatchObject({ cashbackUsed: false });
  });

  it('creates a sale and includes the customer name when listing', async () => {
    const res = await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 4590 }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.sale).toMatchObject({ customerId, saleDate: '2026-09-14', valueCents: 4590 });

    const listRes = await GET(getReq());
    const listData = await listRes.json();
    expect(listData.sales).toHaveLength(1);
    expect(listData.sales[0].customerName).toBe('Ana');
  });

  it('rejects a customerId that does not exist or belongs to a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const [otherCustomer] = await db.insert(customers).values({ storeId: otherStoreId, name: 'Outra loja', phone: '1' }).returning();

    const res1 = await POST(postReq({ customerId: 999999, saleDate: '2026-09-14', valueCents: 4590 }));
    expect(res1.status).toBe(400);

    const res2 = await POST(postReq({ customerId: otherCustomer.id, saleDate: '2026-09-14', valueCents: 4590 }));
    expect(res2.status).toBe(400);
  });

  it('rejects an invalid or missing saleDate', async () => {
    const res = await POST(postReq({ customerId, saleDate: '14/09/2026', valueCents: 4590 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_date');
  });

  it('rejects a zero or negative valueCents', async () => {
    const res = await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 0 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_value');
  });

  it('only lists sales from the current store', async () => {
    await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 4590 }));
    const res = await GET(getReq());
    expect((await res.json()).sales).toHaveLength(1);

    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const otherRes = await GET(unlockedRequest('http://localhost/api/sales', otherStoreId));
    expect((await otherRes.json()).sales).toHaveLength(0);
  });

  it('paginates results', async () => {
    for (let i = 1; i <= 3; i++) {
      await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 1000 * i }));
    }
    const res = await GET(getReq('?pageSize=2&page=1'));
    const data = await res.json();
    expect(data.sales).toHaveLength(2);
    expect(data.total).toBe(3);
  });

  it('returns 400 invalid_json when the body is malformed', async () => {
    const res = await POST(unlockedRequest('http://localhost/api/sales', storeId, { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });

  it('sorts by most recent sale date by default', async () => {
    await POST(postReq({ customerId, saleDate: '2026-09-10', valueCents: 1000 }));
    await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 2000 }));
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.sales.map((s: { saleDate: string }) => s.saleDate)).toEqual(['2026-09-14', '2026-09-10']);
  });

  it('sorts alphabetically by customer name when sort=name', async () => {
    const [customerB] = await db.insert(customers).values({ storeId, name: 'Bia', phone: '2' }).returning();
    await POST(postReq({ customerId, saleDate: '2026-09-10', valueCents: 1000 })); // Ana
    await POST(
      unlockedRequest('http://localhost/api/sales', storeId, {
        method: 'POST',
        body: JSON.stringify({ customerId: customerB.id, saleDate: '2026-09-14', valueCents: 2000 }),
      }),
    ); // Bia

    const res = await GET(getReq('?sort=name'));
    const data = await res.json();
    expect(data.sales.map((s: { customerName: string }) => s.customerName)).toEqual(['Ana', 'Bia']);
  });

  it('creates the sale even if the WhatsApp send fails, and logs the failure', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));

    const res = await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 10000 }));
    expect(res.status).toBe(201);

    const rows = await db.select().from(whatsappSends);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'purchase', status: 'failed', trigger: 'auto' });
  });

  it('sends the purchase confirmation and logs it as sent when Meta is configured', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 10000 }));

    const rows = await db.select().from(whatsappSends);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'purchase', status: 'sent', trigger: 'auto' });
  });

  it('does not attempt or log any WhatsApp send when the API is not configured', async () => {
    await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 10000 }));

    const rows = await db.select().from(whatsappSends);
    expect(rows).toHaveLength(0);
  });

  it('uses the store-specific cashback percent when sending the Meta template', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    await db.update(stores).set({ cashbackPercent: 10 }).where(eq(stores.id, storeId));

    await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 10000 }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.template.components[0].parameters[2].text).toBe('R$ 10,00');
  });
});
