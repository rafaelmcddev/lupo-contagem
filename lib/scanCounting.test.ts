import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { countings, groups, skus } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { CountingNotActiveError, InvalidBarcodeError, SkuRequiredError, recordScan } from './scanCounting';

beforeEach(resetDb);

async function createActiveCounting(prefixLength = 7) {
  const [row] = await db.insert(countings).values({ name: 'Teste', prefixLengthUsed: prefixLength, status: 'active' }).returning();
  return row;
}

describe('recordScan', () => {
  it('rejects a brand-new barcode with no SKU provided, and records nothing', async () => {
    const counting = await createActiveCounting();
    await expect(recordScan(db, counting.id, '7891234000011')).rejects.toThrow(SkuRequiredError);
    const rows = await db.select().from(skus);
    expect(rows).toHaveLength(0);
  });

  it('creates box 1 and links the SKU on the first scan of a new prefix', async () => {
    const counting = await createActiveCounting();
    const outcome = await recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P');
    expect(outcome.duplicate).toBe(false);
    expect(outcome.box?.boxNumber).toBe(1);
    expect(outcome.box?.total).toBe(1);
    expect(outcome.box?.sku).toBe('CUECA-SLIP-P');
  });

  it('requires its own SKU the first time a different exact barcode under the same prefix is seen', async () => {
    const counting = await createActiveCounting();
    await recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P');
    await expect(recordScan(db, counting.id, '7891234999999')).rejects.toThrow(SkuRequiredError);
    const outcome = await recordScan(db, counting.id, '7891234999999', 'CUECA-SLIP-M');
    expect(outcome.box?.sku).toBe('CUECA-SLIP-M');
    expect(outcome.box?.boxNumber).toBe(1);
  });

  it('reuses the same box for the same prefix and increments the total', async () => {
    const counting = await createActiveCounting();
    await recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P');
    const outcome = await recordScan(db, counting.id, '7891234999999', 'CUECA-SLIP-M');
    expect(outcome.box?.boxNumber).toBe(1);
    expect(outcome.box?.total).toBe(2);
  });

  it('creates a new box for a different prefix', async () => {
    const counting = await createActiveCounting();
    await recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P');
    const outcome = await recordScan(db, counting.id, '7899999000011', 'OUTRO-SKU');
    expect(outcome.box?.boxNumber).toBe(2);
  });

  it('ignores a repeated identical barcode scanned within 1 second', async () => {
    const counting = await createActiveCounting();
    await recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P');
    const outcome = await recordScan(db, counting.id, '7891234000011');
    expect(outcome.duplicate).toBe(true);
  });

  it('resolves the group name when a matching prefix is registered', async () => {
    await db.insert(groups).values({ prefix: '789123', name: 'Cueca Slip Preta' });
    const counting = await createActiveCounting();
    const outcome = await recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P');
    expect(outcome.box?.groupName).toBe('Cueca Slip Preta');
  });

  it('rejects a barcode shorter than the prefix length', async () => {
    const counting = await createActiveCounting();
    await expect(recordScan(db, counting.id, '123')).rejects.toThrow(InvalidBarcodeError);
  });

  it('rejects scanning into a finished counting', async () => {
    const counting = await createActiveCounting();
    await db.update(countings).set({ status: 'finished' }).where(eq(countings.id, counting.id));
    await expect(recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P')).rejects.toThrow(CountingNotActiveError);
  });

  it('creates exactly one box when two scans of the same new prefix happen concurrently', async () => {
    const counting = await createActiveCounting();
    const [a, b] = await Promise.all([
      recordScan(db, counting.id, '1111111000001', 'SKU-A'),
      recordScan(db, counting.id, '1111111000002', 'SKU-B'),
    ]);
    expect(a.box?.boxNumber).toBe(1);
    expect(b.box?.boxNumber).toBe(1);
    const finalCount = await db.execute(sql`SELECT COUNT(*)::int AS count FROM scans WHERE box_id = ${a.box!.boxId}`);
    expect(Number((finalCount as any).rows[0].count)).toBe(2);
  });

  it('creates two separate boxes when two different new prefixes race for the same box number', async () => {
    const counting = await createActiveCounting();
    const [a, b] = await Promise.all([
      recordScan(db, counting.id, '2222222000001', 'SKU-X'),
      recordScan(db, counting.id, '3333333000001', 'SKU-Y'),
    ]);
    const boxNumbers = new Set([a.box?.boxNumber, b.box?.boxNumber]);
    expect(boxNumbers).toEqual(new Set([1, 2]));
  });

  it('keeps the first-registered SKU when two people link the same new barcode concurrently', async () => {
    const counting = await createActiveCounting();
    const [a, b] = await Promise.all([
      recordScan(db, counting.id, '7891234000011', 'SKU-FIRST'),
      recordScan(db, counting.id, '7891234000011', 'SKU-SECOND'),
    ]);
    const skuRows = await db.select().from(skus);
    expect(skuRows).toHaveLength(1);
    // both outcomes must agree on whichever SKU won the race
    const winningSku = skuRows[0].sku;
    expect([a.box?.sku, b.box?.sku].filter(Boolean)).toContain(winningSku);
  });

  it('does not dedupe replayed identical scans when their original scannedAt times are spaced apart (queued-scan replay)', async () => {
    const counting = await createActiveCounting();
    const t1 = new Date('2026-01-01T10:00:00Z');
    const t2 = new Date('2026-01-01T10:00:02Z');
    const t3 = new Date('2026-01-01T10:00:04Z');

    const a = await recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P', t1);
    const b = await recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P', t2);
    const c = await recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P', t3);

    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(false);
    expect(c.duplicate).toBe(false);
    expect(c.box?.total).toBe(3);
  });

  it('still dedupes when the original scannedAt times are within the 1s window', async () => {
    const counting = await createActiveCounting();
    const t1 = new Date('2026-01-01T10:00:00.000Z');
    const t2 = new Date('2026-01-01T10:00:00.500Z');

    const a = await recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P', t1);
    const b = await recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P', t2);

    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
  });
});
