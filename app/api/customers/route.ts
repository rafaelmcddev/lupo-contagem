import { NextResponse } from 'next/server';
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers } from '@/db/schema';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 100;

export async function GET(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE),
  );

  const searchCondition = q ? or(ilike(customers.name, `%${q}%`), ilike(customers.phone, `%${q}%`)) : undefined;
  const where = searchCondition ? and(eq(customers.storeId, storeId), searchCondition) : eq(customers.storeId, storeId);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(customers).where(where);
  const rows = await db
    .select()
    .from(customers)
    .where(where)
    .orderBy(asc(customers.name))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return NextResponse.json({ customers: rows, total: count, page, pageSize });
}

export async function POST(req: Request) {
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

  const [row] = await db.insert(customers).values({ storeId, name, phone }).returning();
  return NextResponse.json({ customer: row }, { status: 201 });
}
