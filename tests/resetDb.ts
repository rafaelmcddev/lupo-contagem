import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

export async function resetDb() {
  await db.execute(sql`TRUNCATE TABLE scans, boxes, countings, groups, settings, skus, customers, sales, whatsapp_sends, cashback_cleanup_log RESTART IDENTITY CASCADE`);
}
