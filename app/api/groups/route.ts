import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { groups } from '@/db/schema';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  const rows = await db.select().from(groups).where(eq(groups.storeId, storeId)).orderBy(asc(groups.prefix));
  return NextResponse.json({ groups: rows });
}

export async function POST(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const prefix = String(body.prefix ?? '').trim();
  const name = String(body.name ?? '').trim();
  if (!prefix || !name) {
    return NextResponse.json({ error: 'invalid_group' }, { status: 400 });
  }
  try {
    const [row] = await db.insert(groups).values({ storeId, prefix, name }).returning();
    return NextResponse.json({ group: row }, { status: 201 });
  } catch (err: any) {
    if (err.code === '23505') {
      return NextResponse.json({ error: 'prefix_already_registered' }, { status: 409 });
    }
    throw err;
  }
}
