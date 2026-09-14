import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, sales, whatsappSends } from '@/db/schema';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { type: string; saleId: string } }) {
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }
  const saleId = Number(params.saleId);
  if (!Number.isInteger(saleId) || (params.type !== 'purchase' && params.type !== 'reminder')) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  // `params.type` is still typed as plain `string` here even after the guard
  // above (TypeScript can't narrow a `string` param down to a literal union
  // via an exclusion check) — the guard above proves it's safe, so assert it
  // explicitly rather than fighting the type.
  const type = params.type as 'purchase' | 'reminder';

  const rows = await db
    .select({ id: sales.id, customerName: customers.name, customerPhone: customers.phone })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(and(eq(sales.id, saleId), eq(sales.storeId, storeId)))
    .limit(1);
  const sale = rows[0];
  if (!sale) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  await db.insert(whatsappSends).values({
    storeId,
    saleId: sale.id,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    type,
    status: 'opened',
    trigger: 'queue',
  });

  return NextResponse.json({ ok: true });
}
