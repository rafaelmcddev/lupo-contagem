import { NextResponse } from 'next/server';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { boxes, countings, groups } from '@/db/schema';
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
        SELECT s.sku AS sku, COUNT(*)::int AS total
        FROM scans sc
        JOIN skus s ON s.barcode = sc.barcode
        WHERE sc.box_id = ${box.id}
        GROUP BY s.sku
        ORDER BY s.sku
      `);
      const skuBreakdown = (skuResult as any).rows as { sku: string; total: number }[];
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

  return NextResponse.json({ counting, boxes: boxesWithTotals, grandTotal });
}
