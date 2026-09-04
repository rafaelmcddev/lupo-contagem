import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from './client';

describe('db client', () => {
  it('connects and can run a query', async () => {
    const result = await db.execute(sql`SELECT 1 AS one`);
    expect((result as any).rows[0].one).toBe(1);
  });
});
