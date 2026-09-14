import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/client';
import { customers, sales, whatsappSends } from '@/db/schema';
import { addDaysToIsoDate, todayIso } from '@/lib/dates';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId } from '@/tests/testStores';
import { GET } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
  vi.stubEnv('CRON_SECRET', 'test-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function cronReq(secret = 'test-secret') {
  return new Request('http://localhost/api/cron/reward-reminders', {
    headers: { authorization: `Bearer ${secret}` },
  });
}

async function createDueSale() {
  const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '99999-0000' }).returning();
  const [sale] = await db
    .insert(sales)
    .values({ storeId, customerId: customer.id, saleDate: addDaysToIsoDate(todayIso(), -25), valueCents: 10000 })
    .returning();
  return sale;
}

describe('GET /api/cron/reward-reminders', () => {
  it('returns 401 with a missing or wrong secret', async () => {
    const res = await GET(cronReq('wrong'));
    expect(res.status).toBe(401);
  });

  it('returns skipped:not_configured and sends nothing when the Meta API is not configured', async () => {
    const sale = await createDueSale();
    const res = await GET(cronReq());
    const data = await res.json();
    expect(data.skipped).toBe('not_configured');
    const rows = await db.select().from(whatsappSends);
    expect(rows).toHaveLength(0);
  });

  it('sends the reminder and logs it when configured and a sale is due', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    const sale = await createDueSale();
    const res = await GET(cronReq());
    const data = await res.json();
    expect(data.sent).toBe(1);

    const [row] = await db.select().from(whatsappSends);
    expect(row).toMatchObject({ saleId: sale.id, type: 'reminder', status: 'sent', trigger: 'auto' });
  });

  it('does not resend a reminder that was already logged', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await createDueSale();
    await GET(cronReq());
    await GET(cronReq());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('checks sales across every store, not just one', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    await createDueSale();
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const [otherCustomer] = await db.insert(customers).values({ storeId: otherStoreId, name: 'Bia', phone: '1' }).returning();
    await db.insert(sales).values({ storeId: otherStoreId, customerId: otherCustomer.id, saleDate: addDaysToIsoDate(todayIso(), -25), valueCents: 5000 });

    const res = await GET(cronReq());
    const data = await res.json();
    expect(data.sent).toBe(2);
  });
});
