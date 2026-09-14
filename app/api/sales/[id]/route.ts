import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, sales } from '@/db/schema';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

const SALE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
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

  const customerId = Number(body.customerId);
  const saleDate = String(body.saleDate ?? '');
  const valueCents = Number(body.valueCents);

  if (!Number.isInteger(customerId)) {
    return NextResponse.json({ error: 'invalid_customer' }, { status: 400 });
  }
  if (!SALE_DATE_PATTERN.test(saleDate)) {
    return NextResponse.json({ error: 'invalid_date' }, { status: 400 });
  }
  if (!Number.isInteger(valueCents) || valueCents <= 0) {
    return NextResponse.json({ error: 'invalid_value' }, { status: 400 });
  }

  const customerRows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.storeId, storeId)))
    .limit(1);
  if (!customerRows[0]) {
    return NextResponse.json({ error: 'invalid_customer' }, { status: 400 });
  }

  const [row] = await db
    .update(sales)
    .set({ customerId, saleDate, valueCents })
    .where(and(eq(sales.id, id), eq(sales.storeId, storeId)))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ sale: row });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }

  const [row] = await db
    .delete(sales)
    .where(and(eq(sales.id, id), eq(sales.storeId, storeId)))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
