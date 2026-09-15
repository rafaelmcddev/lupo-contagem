import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { stores } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId } from '@/tests/testStores';
import { DEFAULT_CASHBACK_EXPIRY_DAYS, DEFAULT_CASHBACK_MAX_USAGE_PERCENT, DEFAULT_CASHBACK_PERCENT } from './rewards';
import { getStoreCashbackSettings } from './storeCashback';
import { DEFAULT_WHATSAPP_MESSAGE_TEMPLATE } from './whatsapp';

describe('getStoreCashbackSettings', () => {
  let storeId: number;

  beforeEach(async () => {
    await resetDb();
    storeId = await getTestStoreId();
  });

  it('falls back to the global defaults when the store has none configured', async () => {
    const settings = await getStoreCashbackSettings(db, storeId);
    expect(settings.percent).toBe(DEFAULT_CASHBACK_PERCENT);
    expect(settings.expiryDays).toBe(DEFAULT_CASHBACK_EXPIRY_DAYS);
    expect(settings.maxUsagePercent).toBe(DEFAULT_CASHBACK_MAX_USAGE_PERCENT);
    expect(settings.messageTemplate).toBe(DEFAULT_WHATSAPP_MESSAGE_TEMPLATE);
  });

  it('uses the store-specific values when configured', async () => {
    await db
      .update(stores)
      .set({ cashbackPercent: 10, cashbackExpiryDays: 45, cashbackMaxUsagePercent: 30, whatsappMessageTemplate: 'Oi %nome%, de %loja%!' })
      .where(eq(stores.id, storeId));

    const settings = await getStoreCashbackSettings(db, storeId);
    expect(settings.percent).toBe(10);
    expect(settings.expiryDays).toBe(45);
    expect(settings.maxUsagePercent).toBe(30);
    expect(settings.messageTemplate).toBe('Oi %nome%, de %loja%!');
  });

  it('throws when the store does not exist', async () => {
    await expect(getStoreCashbackSettings(db, 999999)).rejects.toThrow();
  });
});
