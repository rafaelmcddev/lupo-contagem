import { NextResponse } from 'next/server';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { boxes, countings, groups, invoiceItems, scans } from '@/db/schema';
import { resolveGroupName } from '@/lib/groupMatch';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const countingId = Number(params.id);
  if (!Number.isInteger(countingId)) {
    return NextResponse.json({ error: 'counting_not_found' }, { status: 404 });
  }
  const countingRows = await db.select().from(countings).where(eq(countings.id, countingId)).limit(1);
  const counting = countingRows[0];
  if (!counting) {
    return NextResponse.json({ error: 'counting_not_found' }, { status: 404 });
  }

  const boxRows = await db.select().from(boxes).where(eq(boxes.countingId, countingId)).orderBy(asc(boxes.boxNumber));
  const allGroups = await db.select().from(groups);

  const boxesWithTotals = await Promise.all(
    boxRows.map(async (box) => {
      const skuResult = await db.execute(sql`
        SELECT s.sku AS sku, s.name AS name, COUNT(*)::int AS total
        FROM scans sc
        LEFT JOIN skus s ON s.barcode = sc.barcode
        WHERE sc.box_id = ${box.id}
        GROUP BY s.sku, s.name
        ORDER BY s.sku
      `);
      const skuBreakdown = (skuResult as any).rows as { sku: string | null; name: string | null; total: number }[];
      const total = skuBreakdown.reduce((sum, s) => sum + s.total, 0);
      return {
        boxNumber: box.boxNumber,
        prefix: box.prefix,
        groupName: resolveGroupName(box.prefix, allGroups),
        total,
        skuBreakdown,
      };
    }),
  );

  const grandTotal = boxesWithTotals.reduce((sum, b) => sum + b.total, 0);

  let invoiceCheck: {
    barcode: string;
    sku: string | null;
    name: string | null;
    expectedQty: number;
    countedQty: number;
  }[] | null = null;

  if (counting.source === 'xml') {
    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.countingId, countingId));
    invoiceCheck = await Promise.all(
      items.map(async (item) => {
        const countedResult = await db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM scans sc
          JOIN boxes b ON b.id = sc.box_id
          WHERE b.counting_id = ${countingId} AND sc.barcode = ${item.barcode}
        `);
        const countedQty = ((countedResult as any).rows[0]?.total as number) ?? 0;
        return {
          barcode: item.barcode,
          sku: item.sku,
          name: item.name,
          expectedQty: item.expectedQty,
          countedQty,
        };
      }),
    );
    invoiceCheck.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }

  return NextResponse.json({ counting, boxes: boxesWithTotals, grandTotal, invoiceCheck });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const countingId = Number(params.id);
  if (!Number.isInteger(countingId)) {
    return NextResponse.json({ error: 'counting_not_found' }, { status: 404 });
  }

  const countingRows = await db.select().from(countings).where(eq(countings.id, countingId)).limit(1);
  if (!countingRows[0]) {
    return NextResponse.json({ error: 'counting_not_found' }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    const boxRows = await tx.select({ id: boxes.id }).from(boxes).where(eq(boxes.countingId, countingId));
    const boxIds = boxRows.map((b) => b.id);
    if (boxIds.length > 0) {
      await tx.delete(scans).where(inArray(scans.boxId, boxIds));
    }
    await tx.delete(invoiceItems).where(eq(invoiceItems.countingId, countingId));
    await tx.delete(boxes).where(eq(boxes.countingId, countingId));
    await tx.delete(countings).where(eq(countings.id, countingId));
  });

  return NextResponse.json({ ok: true });
}
