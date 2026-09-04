import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { skus } from '@/db/schema';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request, { params }: { params: { barcode: string } }) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const sku = String(body.sku ?? '').trim();
  const name = String(body.name ?? '').trim();
  if (!sku || !name) {
    return NextResponse.json({ error: 'invalid_product' }, { status: 400 });
  }
  const [row] = await db.update(skus).set({ sku, name }).where(eq(skus.barcode, params.barcode)).returning();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ product: row });
}

export async function DELETE(_req: Request, { params }: { params: { barcode: string } }) {
  const [row] = await db.delete(skus).where(eq(skus.barcode, params.barcode)).returning();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
