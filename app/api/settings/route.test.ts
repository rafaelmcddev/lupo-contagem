import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CASHBACK_EXPIRY_DAYS, DEFAULT_CASHBACK_MAX_USAGE_PERCENT, DEFAULT_CASHBACK_PERCENT } from '@/lib/rewards';
import { DEFAULT_WHATSAPP_MESSAGE_TEMPLATE } from '@/lib/whatsapp';
import { resetDb } from '@/tests/resetDb';
import { masterUnlockedRequest } from '@/tests/testMasterPassword';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { GET, PUT } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function getReq() {
  return storeRequest('http://localhost/api/settings', storeId);
}

function putReq(body: object) {
  return masterUnlockedRequest('http://localhost/api/settings', storeId, { method: 'PUT', body: JSON.stringify(body) });
}

const validCashbackBody = {
  prefixLength: 7,
  requireSku: true,
  cashbackPercent: 5,
  cashbackExpiryDays: 30,
  cashbackMaxUsagePercent: 20,
  whatsappMessageTemplate: 'Oi %nome%',
};

describe('/api/settings', () => {
  it('returns the default prefix length, requireSku, and this store\'s cashback defaults when nothing is set', async () => {
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.prefixLength).toBe(7);
    expect(data.requireSku).toBe(true);
    expect(data.cashbackPercent).toBe(DEFAULT_CASHBACK_PERCENT);
    expect(data.cashbackExpiryDays).toBe(DEFAULT_CASHBACK_EXPIRY_DAYS);
    expect(data.cashbackMaxUsagePercent).toBe(DEFAULT_CASHBACK_MAX_USAGE_PERCENT);
    expect(data.whatsappMessageTemplate).toBe(DEFAULT_WHATSAPP_MESSAGE_TEMPLATE);
  });

  it('saves and returns the updated prefix length, requireSku, and cashback settings', async () => {
    await PUT(
      putReq({
        prefixLength: 9,
        requireSku: false,
        cashbackPercent: 8,
        cashbackExpiryDays: 45,
        cashbackMaxUsagePercent: 25,
        whatsappMessageTemplate: 'Oi %nome%, %loja%!',
      }),
    );
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.prefixLength).toBe(9);
    expect(data.requireSku).toBe(false);
    expect(data.cashbackPercent).toBe(8);
    expect(data.cashbackExpiryDays).toBe(45);
    expect(data.cashbackMaxUsagePercent).toBe(25);
    expect(data.whatsappMessageTemplate).toBe('Oi %nome%, %loja%!');
  });

  it('only changes the requesting store\'s cashback settings, not other stores', async () => {
    await PUT(putReq({ ...validCashbackBody, cashbackPercent: 20 }));
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const res = await GET(storeRequest('http://localhost/api/settings', otherStoreId));
    const data = await res.json();
    expect(data.cashbackPercent).toBe(DEFAULT_CASHBACK_PERCENT);
  });

  it('rejects an invalid prefix length', async () => {
    const res = await PUT(putReq({ ...validCashbackBody, prefixLength: 0 }));
    expect(res.status).toBe(400);
  });

  it('rejects a non-boolean requireSku', async () => {
    const res = await PUT(putReq({ ...validCashbackBody, requireSku: 'yes' }));
    expect(res.status).toBe(400);
  });

  it('rejects a cashback percent outside 0-100', async () => {
    const res = await PUT(putReq({ ...validCashbackBody, cashbackPercent: 150 }));
    expect(res.status).toBe(400);
  });

  it('rejects a cashback expiry below the 5-day minimum', async () => {
    const res = await PUT(putReq({ ...validCashbackBody, cashbackExpiryDays: 2 }));
    expect(res.status).toBe(400);
  });

  it('rejects a cashback max-usage percent of 0 or below', async () => {
    const res = await PUT(putReq({ ...validCashbackBody, cashbackMaxUsagePercent: 0 }));
    expect(res.status).toBe(400);
  });

  it('rejects a cashback max-usage percent above 100', async () => {
    const res = await PUT(putReq({ ...validCashbackBody, cashbackMaxUsagePercent: 150 }));
    expect(res.status).toBe(400);
  });

  it('reports whatsappApiConfigured as false while the 3 Meta env vars are not all set', async () => {
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.whatsappApiConfigured).toBe(false);
  });

  it('reports whatsappApiConfigured as true once all 3 Meta env vars are set', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.whatsappApiConfigured).toBe(true);
  });

  it('rejects an empty WhatsApp message template', async () => {
    const res = await PUT(putReq({ ...validCashbackBody, whatsappMessageTemplate: '   ' }));
    expect(res.status).toBe(400);
  });

  it('rejects a save without the master password unlocked', async () => {
    const res = await PUT(storeRequest('http://localhost/api/settings', storeId, { method: 'PUT', body: JSON.stringify(validCashbackBody) }));
    expect(res.status).toBe(401);
  });
});
