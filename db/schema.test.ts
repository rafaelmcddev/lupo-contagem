import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './client';
import { boxes, countings, groups, scans, settings, skus } from './schema';
import { resetDb } from '@/tests/resetDb';

describe('schema', () => {
  beforeEach(async () => {
    await resetDb();
  });
  it('can insert a counting, a box and a scan, and enforces the unique prefix per counting', async () => {
    const [counting] = await db
      .insert(countings)
      .values({ name: 'Teste', prefixLengthUsed: 7, status: 'active' })
      .returning();

    const [box] = await db
      .insert(boxes)
      .values({ countingId: counting.id, boxNumber: 1, prefix: '7891234' })
      .returning();

    await db.insert(scans).values({ boxId: box.id, barcode: '7891234000011' });

    const found = await db.select().from(countings).where(eq(countings.id, counting.id));
    expect(found[0].name).toBe('Teste');

    await expect(
      db.insert(boxes).values({ countingId: counting.id, boxNumber: 2, prefix: '7891234' }),
    ).rejects.toThrow();
  });

  it('enforces a unique prefix on groups', async () => {
    await db.insert(groups).values({ prefix: '789123', name: 'Cueca Slip Preta' });
    await expect(
      db.insert(groups).values({ prefix: '789123', name: 'Outro nome' }),
    ).rejects.toThrow();
  });

  it('can upsert a setting by key', async () => {
    await db.insert(settings).values({ key: 'prefix_length', value: '7' });
    await db
      .insert(settings)
      .values({ key: 'prefix_length', value: '8' })
      .onConflictDoUpdate({ target: settings.key, set: { value: '8' } });
    const row = await db.select().from(settings).where(eq(settings.key, 'prefix_length'));
    expect(row[0].value).toBe('8');
  });

  it('links an exact barcode to a SKU, keyed by the barcode itself', async () => {
    await db.insert(skus).values({ barcode: '7891234000011', sku: 'CUECA-SLIP-P' });
    const row = await db.select().from(skus).where(eq(skus.barcode, '7891234000011'));
    expect(row[0].sku).toBe('CUECA-SLIP-P');

    await expect(
      db.insert(skus).values({ barcode: '7891234000011', sku: 'OUTRO-SKU' }),
    ).rejects.toThrow();
  });
});
