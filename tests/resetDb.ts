import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

export async function resetDb() {
  await db.execute(sql`TRUNCATE TABLE scans, boxes, countings, groups, settings, skus RESTART IDENTITY CASCADE`);
}
