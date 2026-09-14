import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { stores } from '@/db/schema';
import { getSalePinEnvVarName } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const pin = String(body.pin ?? '');

  const storeRows = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  const store = storeRows[0];
  if (!store) {
    return NextResponse.json({ error: 'invalid_pin' }, { status: 401 });
  }

  const expectedPin = process.env[getSalePinEnvVarName(store.slug)];
  if (!expectedPin || pin !== expectedPin) {
    return NextResponse.json({ error: 'invalid_pin' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
