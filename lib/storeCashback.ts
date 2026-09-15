import { eq } from 'drizzle-orm';
import type { DbClient } from '@/db/client';
import { stores } from '@/db/schema';
import { DEFAULT_CASHBACK_EXPIRY_DAYS, DEFAULT_CASHBACK_MAX_USAGE_PERCENT, DEFAULT_CASHBACK_PERCENT } from '@/lib/rewards';
import { DEFAULT_WHATSAPP_MESSAGE_TEMPLATE } from '@/lib/whatsapp';

export type StoreCashbackSettings = {
  name: string;
  percent: number;
  expiryDays: number;
  maxUsagePercent: number;
  messageTemplate: string;
};

export async function getStoreCashbackSettings(db: DbClient, storeId: number): Promise<StoreCashbackSettings> {
  const [row] = await db
    .select({
      name: stores.name,
      percent: stores.cashbackPercent,
      expiryDays: stores.cashbackExpiryDays,
      maxUsagePercent: stores.cashbackMaxUsagePercent,
      messageTemplate: stores.whatsappMessageTemplate,
    })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);
  if (!row) {
    throw new Error(`store ${storeId} not found`);
  }
  return {
    name: row.name,
    percent: row.percent ?? DEFAULT_CASHBACK_PERCENT,
    expiryDays: row.expiryDays ?? DEFAULT_CASHBACK_EXPIRY_DAYS,
    maxUsagePercent: row.maxUsagePercent ?? DEFAULT_CASHBACK_MAX_USAGE_PERCENT,
    messageTemplate: row.messageTemplate ?? DEFAULT_WHATSAPP_MESSAGE_TEMPLATE,
  };
}
