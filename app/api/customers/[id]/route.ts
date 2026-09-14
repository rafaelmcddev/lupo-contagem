import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers } from '@/db/schema';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

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
  const name = String(body.name ?? '').trim();
  const phone = String(body.phone ?? '').trim();
  if (!name || !phone) {
    return NextResponse.json({ error: 'invalid_customer' }, { status: 400 });
  }

  const [row] = await db
    .update(customers)
    .set({ name, phone })
    .where(and(eq(customers.id, id), eq(customers.storeId, storeId)))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ customer: row });
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
    .delete(customers)
    .where(and(eq(customers.id, id), eq(customers.storeId, storeId)))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
