import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import {
  CountingNotActiveError,
  CountingNotFoundError,
  InvalidBarcodeError,
  SkuRequiredError,
  recordScan,
} from '@/lib/scanCounting';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const countingId = Number(params.id);
  const body = await req.json();
  const barcode = String(body.barcode ?? '');
  const sku = typeof body.sku === 'string' ? body.sku : undefined;

  try {
    const outcome = await recordScan(db, countingId, barcode, sku);
    return NextResponse.json(outcome);
  } catch (err) {
    if (err instanceof InvalidBarcodeError) {
      return NextResponse.json({ error: 'invalid_barcode' }, { status: 400 });
    }
    if (err instanceof CountingNotFoundError) {
      return NextResponse.json({ error: 'counting_not_found' }, { status: 404 });
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
