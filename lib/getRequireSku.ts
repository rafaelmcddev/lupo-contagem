import { eq } from 'drizzle-orm';
import { settings } from '@/db/schema';
import type { DbClient } from '@/db/client';

export const REQUIRE_SKU_KEY = 'require_sku';
export const DEFAULT_REQUIRE_SKU = true;

export async function getRequireSku(db: DbClient): Promise<boolean> {
  const row = await db.select().from(settings).where(eq(settings.key, REQUIRE_SKU_KEY)).limit(1);
  if (!row[0]) return DEFAULT_REQUIRE_SKU;
  return row[0].value === 'true';
}
