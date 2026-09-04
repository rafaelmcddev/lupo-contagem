import { eq } from 'drizzle-orm';
import { settings } from '@/db/schema';
import type { DbClient } from '@/db/client';

export const PREFIX_LENGTH_KEY = 'prefix_length';
export const DEFAULT_PREFIX_LENGTH = 7;

export async function getPrefixLength(db: DbClient): Promise<number> {
  const row = await db.select().from(settings).where(eq(settings.key, PREFIX_LENGTH_KEY)).limit(1);
  return row[0] ? Number(row[0].value) : DEFAULT_PREFIX_LENGTH;
}
