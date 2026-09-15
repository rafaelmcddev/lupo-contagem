import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/client';
import { customers, sales, stores, whatsappSends } from '@/db/schema';
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

afterEach(() => {
  vi.unstubAllEnvs();
});

async function createSale(overrides: { saleDate?: string; cashbackUsed?: boolean } = {}) {
  const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '99999-0000' }).returning();
  const [sale] = await db
    .insert(sales)
    .values({
      storeId,
      customerId: customer.id,
      saleDate: overrides.saleDate ?? todayIso(),
      valueCents: 10000,
      cashbackUsed: overrides.cashbackUsed ?? false,
    })
    .returning();
  return sale;
}

function getReq() {
  return unlockedRequest('http://localhost', storeId);
}

describe('GET /api/whatsapp/pending', () => {
  it('returns 401 when the PIN is not unlocked', async () => {
    const res = await GET(storeRequest('http://localhost', storeId));
    expect(res.status).toBe(401);
  });

  it('lists a freshly registered sale as a pending purchase confirmation', async () => {
    const sale = await createSale();
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.pending).toContainEqual(expect.objectContaining({ saleId: sale.id, type: 'purchase' }));
  });

  it('does not list a sale whose purchase confirmation was already sent', async () => {
    const sale = await createSale();
    await db.insert(whatsappSends).values({
      storeId,
      saleId: sale.id,
      customerName: 'Ana',
      customerPhone: '99999-0000',
      type: 'purchase',
      status: 'sent',
      trigger: 'auto',
    });
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.pending.some((p: any) => p.saleId === sale.id && p.type === 'purchase')).toBe(false);
  });

  it('lists a reminder as pending once 28 days have passed and cashback is unused', async () => {
    // Full expiry is 33 days (30 configured + 3-day usable-after delay); the
    // reminder fires 5 days before that, i.e. day 28.
    const sale = await createSale({ saleDate: addDaysToIsoDate(todayIso(), -28) });
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.pending).toContainEqual(expect.objectContaining({ saleId: sale.id, type: 'reminder' }));
  });

  it('does not list a reminder before day 28', async () => {
    const sale = await createSale({ saleDate: addDaysToIsoDate(todayIso(), -10) });
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.pending.some((p: any) => p.saleId === sale.id && p.type === 'reminder')).toBe(false);
  });

  it('does not list a reminder for a sale whose cashback was already used', async () => {
    const sale = await createSale({ saleDate: addDaysToIsoDate(todayIso(), -28), cashbackUsed: true });
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.pending.some((p: any) => p.saleId === sale.id && p.type === 'reminder')).toBe(false);
  });

  it('does not list a reminder for a sale that already expired (33+ days)', async () => {
    const sale = await createSale({ saleDate: addDaysToIsoDate(todayIso(), -34) });
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.pending.some((p: any) => p.saleId === sale.id && p.type === 'reminder')).toBe(false);
  });

  it('each pending item carries the phone and ready-to-send message text — the URL is built client-side', async () => {
    await createSale();
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.pending[0].phone).toBe('99999-0000');
    expect(typeof data.pending[0].message).toBe('string');
    expect(data.pending[0].message.length).toBeGreaterThan(0);
  });

  it('does not list a sale bought 40 days ago (already expired) as a pending purchase', async () => {
    const sale = await createSale({ saleDate: addDaysToIsoDate(todayIso(), -40) });
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.pending.some((p: any) => p.saleId === sale.id && p.type === 'purchase')).toBe(false);
  });

  it('does not list a reminder when the Meta API is fully configured (the cron owns it)', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');

    const sale = await createSale({ saleDate: addDaysToIsoDate(todayIso(), -28) });
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.pending.some((p: any) => p.saleId === sale.id && p.type === 'reminder')).toBe(false);
  });

  it('uses the store-specific expiry (not the 30-day default) to decide what is pending', async () => {
    await db.update(stores).set({ cashbackExpiryDays: 45 }).where(eq(stores.id, storeId));
    // 40 days ago is past the default's 33-day full expiry but still well within this store's 48-day one.
    const sale = await createSale({ saleDate: addDaysToIsoDate(todayIso(), -40) });
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.pending.some((p: any) => p.saleId === sale.id && p.type === 'purchase')).toBe(true);
  });

  it('no longer lists a reminder after it was already sent manually — the queue is the only delivery mechanism when the API is not configured', async () => {
    const sale = await createSale({ saleDate: addDaysToIsoDate(todayIso(), -28) });
    await db.insert(whatsappSends).values({
      storeId,
      saleId: sale.id,
      customerName: 'Ana',
      customerPhone: '99999-0000',
      type: 'reminder',
      status: 'opened',
      trigger: 'manual',
    });
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.pending.some((p: any) => p.saleId === sale.id && p.type === 'reminder')).toBe(false);
  });
});
