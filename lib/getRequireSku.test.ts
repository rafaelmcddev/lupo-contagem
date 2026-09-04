import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { settings } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { REQUIRE_SKU_KEY, getRequireSku } from './getRequireSku';

beforeEach(resetDb);

describe('getRequireSku', () => {
  it('defaults to true when unset', async () => {
    expect(await getRequireSku(db)).toBe(true);
  });

  it('returns false when the setting is stored as "false"', async () => {
    await db.insert(settings).values({ key: REQUIRE_SKU_KEY, value: 'false' });
    expect(await getRequireSku(db)).toBe(false);
  });

  it('returns true when the setting is stored as "true"', async () => {
    await db.insert(settings).values({ key: REQUIRE_SKU_KEY, value: 'true' });
    expect(await getRequireSku(db)).toBe(true);
  });
});
