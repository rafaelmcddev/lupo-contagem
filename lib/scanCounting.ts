import { and, desc, eq, sql } from 'drizzle-orm';
import { boxes, countings, groups, scans, skus } from '@/db/schema';
import type { DbClient } from '@/db/client';
import { extractPrefix, isValidBarcode } from './prefix';
import { isDuplicateScan } from './dedupe';
import { resolveGroupName } from './groupMatch';

export class InvalidBarcodeError extends Error {}
export class CountingNotFoundError extends Error {}
export class CountingNotActiveError extends Error {}
export class SkuRequiredError extends Error {}

export interface BoxHit {
  boxId: number;
  boxNumber: number;
  prefix: string;
  groupName: string | null;
  sku: string;
  total: number;
}

export interface ScanOutcome {
  duplicate: boolean;
  box: BoxHit | null;
}

interface BoxRow {
  id: number;
  countingId: number;
  boxNumber: number;
  prefix: string;
}

async function findExistingBox(db: DbClient, countingId: number, prefix: string): Promise<BoxRow | undefined> {
  const rows = await db
    .select()
    .from(boxes)
    .where(and(eq(boxes.countingId, countingId), eq(boxes.prefix, prefix)))
    .limit(1);
  return rows[0];
}

async function findOrCreateBox(db: DbClient, countingId: number, prefix: string): Promise<BoxRow> {
  const existing = await findExistingBox(db, countingId, prefix);
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await db.execute(sql`
        INSERT INTO boxes (counting_id, prefix, box_number)
        SELECT ${countingId}, ${prefix},
          COALESCE((SELECT MAX(box_number) FROM boxes WHERE counting_id = ${countingId}), 0) + 1
        ON CONFLICT (counting_id, prefix) DO NOTHING
        RETURNING id, counting_id AS "countingId", box_number AS "boxNumber", prefix
      `);
      const created = (result as any).rows?.[0] as BoxRow | undefined;
      if (created) return created;
    } catch (err: any) {
      if (err.code !== '23505') throw err;
    }
    const retry = await findExistingBox(db, countingId, prefix);
    if (retry) return retry;
  }
  throw new Error('failed_to_create_box');
}

async function findLinkedSku(db: DbClient, barcode: string): Promise<string | undefined> {
  const rows = await db.select().from(skus).where(eq(skus.barcode, barcode)).limit(1);
  return rows[0]?.sku;
}

async function findOrRequireSku(db: DbClient, barcode: string, providedSku: string | undefined): Promise<string> {
  const existing = await findLinkedSku(db, barcode);
  if (existing) return existing;

  const trimmed = (providedSku ?? '').trim();
  if (!trimmed) throw new SkuRequiredError();

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await db.execute(sql`
        INSERT INTO skus (barcode, sku) VALUES (${barcode}, ${trimmed})
        ON CONFLICT (barcode) DO NOTHING
        RETURNING sku
      `);
      const created = (result as any).rows?.[0] as { sku: string } | undefined;
      if (created) return created.sku;
    } catch (err: any) {
      if (err.code !== '23505') throw err;
    }
    const retry = await findLinkedSku(db, barcode);
    if (retry) return retry;
  }
  throw new Error('failed_to_link_sku');
}

/**
 * Records a scan and returns the box hit and duplicate status.
 * MUST be called with the pooled db client, never inside an outer transaction.
 * The retry loops for box creation and SKU linking rely on catching raw Postgres
 * unique-constraint violations and retrying with a fresh query, which only works
 * in autocommit mode. Inside a transaction, a unique violation aborts the entire
 * transaction and subsequent retry queries would fail.
 */
export async function recordScan(
  db: DbClient,
  countingId: number,
  rawBarcode: string,
  sku?: string,
  scannedAt?: Date,
): Promise<ScanOutcome> {
  const countingRows = await db.select().from(countings).where(eq(countings.id, countingId)).limit(1);
  const counting = countingRows[0];
  if (!counting) throw new CountingNotFoundError();
  if (counting.status !== 'active') throw new CountingNotActiveError();

  const prefixLength = counting.prefixLengthUsed;
  const barcode = rawBarcode.trim();
  if (!isValidBarcode(barcode, prefixLength)) throw new InvalidBarcodeError();

  const effectiveNow = scannedAt ?? new Date();

  const prefix = extractPrefix(barcode, prefixLength);
  const existingBox = await findExistingBox(db, countingId, prefix);

  if (existingBox) {
    const lastScanRows = await db
      .select()
      .from(scans)
      .where(eq(scans.boxId, existingBox.id))
      .orderBy(desc(scans.scannedAt))
      .limit(1);
    const last = lastScanRows[0];
    if (isDuplicateScan(last?.scannedAt ?? null, last?.barcode ?? null, barcode, effectiveNow)) {
      return { duplicate: true, box: null };
    }
  }

  const resolvedSku = await findOrRequireSku(db, barcode, sku);

  const box = existingBox ?? (await findOrCreateBox(db, countingId, prefix));
  await db.insert(scans).values({ boxId: box.id, barcode, scannedAt: effectiveNow });

  const countResult = await db.execute(sql`SELECT COUNT(*)::int AS count FROM scans WHERE box_id = ${box.id}`);
  const total = Number((countResult as any).rows[0].count);

  const allGroups = await db.select().from(groups);
  const groupName = resolveGroupName(box.prefix, allGroups);

  return {
    duplicate: false,
    box: { boxId: box.id, boxNumber: box.boxNumber, prefix: box.prefix, groupName, sku: resolvedSku, total },
  };
}
