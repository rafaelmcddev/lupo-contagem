import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { countings } from '@/db/schema';
import {
  CountingNotActiveError,
  InvalidBarcodeError,
  SkuRequiredError,
  recordScan,
} from '@/lib/scanCounting';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const countingId = Number(params.id);
  if (!Number.isInteger(countingId)) {
    return NextResponse.json({ error: 'counting_not_found' }, { status: 404 });
  }
  const storeId = getStoreIdFromRequest(req);
  const countingRows = await db
    .select({ id: countings.id })
    .from(countings)
    .where(and(eq(countings.id, countingId), eq(countings.storeId, storeId)))
    .limit(1);
  if (!countingRows[0]) {
    return NextResponse.json({ error: 'counting_not_found' }, { status: 404 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const barcode = String(body.barcode ?? '');
  const sku = typeof body.sku === 'string' ? body.sku : undefined;
  const scannedAt = typeof body.scannedAt === 'string' ? new Date(body.scannedAt) : undefined;

  try {
    const outcome = await recordScan(db, countingId, barcode, sku, scannedAt);
    return NextResponse.json(outcome);
  } catch (err) {
    if (err instanceof InvalidBarcodeError) {
      return NextResponse.json({ error: 'invalid_barcode' }, { status: 400 });
    }
    if (err instanceof CountingNotActiveError) {
      return NextResponse.json({ error: 'counting_not_active' }, { status: 409 });
    }
    if (err instanceof SkuRequiredError) {
      return NextResponse.json({ error: 'sku_required' }, { status: 422 });
    }
    throw err;
  }
}
