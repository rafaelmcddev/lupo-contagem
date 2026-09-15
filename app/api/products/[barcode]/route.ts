import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { skus } from '@/db/schema';
import { getRequireSku } from '@/lib/getRequireSku';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request, { params }: { params: { barcode: string } }) {
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const skuInput = String(body.sku ?? '').trim();
  const name = String(body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'invalid_product' }, { status: 400 });
  }
  if (!skuInput && (await getRequireSku(db))) {
    return NextResponse.json({ error: 'sku_required' }, { status: 400 });
  }
  const [row] = await db
    .update(skus)
    .set({ sku: skuInput || null, name })
    .where(and(eq(skus.storeId, storeId), eq(skus.barcode, params.barcode)))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ product: row });
}

export async function DELETE(req: Request, { params }: { params: { barcode: string } }) {
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }
  const [row] = await db
    .delete(skus)
    .where(and(eq(skus.storeId, storeId), eq(skus.barcode, params.barcode)))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
