import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

export async function resetDb() {
  await db.execute(sql`TRUNCATE TABLE scans, boxes, countings, groups, settings, skus, customers, sales, whatsapp_sends, cashback_cleanup_log RESTART IDENTITY CASCADE`);
  // stores is seed/reference data (kept across tests, not truncated), but its
  // per-store cashback overrides are mutable settings a test may set — reset
  // them so one test's override can't leak into the next.
  await db.execute(
    sql`UPDATE stores SET cashback_percent = NULL, cashback_expiry_days = NULL, cashback_max_usage_percent = NULL, whatsapp_message_template = NULL`,
  );
}
