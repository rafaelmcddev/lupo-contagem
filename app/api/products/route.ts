import { NextResponse } from 'next/server';
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { skus } from '@/db/schema';
import { getRequireSku } from '@/lib/getRequireSku';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 20;
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

  const searchCondition = q ? or(ilike(skus.name, `%${q}%`), ilike(skus.sku, `%${q}%`), ilike(skus.barcode, `%${q}%`)) : undefined;
  const where = searchCondition ? and(eq(skus.storeId, storeId), searchCondition) : eq(skus.storeId, storeId);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(skus).where(where);
  const rows = await db
    .select()
    .from(skus)
    .where(where)
    .orderBy(asc(skus.name), asc(skus.barcode))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return NextResponse.json({ products: rows, total: count, page, pageSize });
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
  const barcode = String(body.barcode ?? '').trim();
  const skuInput = String(body.sku ?? '').trim();
  const name = String(body.name ?? '').trim();
  if (!barcode || !name) {
    return NextResponse.json({ error: 'invalid_product' }, { status: 400 });
  }
  if (!skuInput && (await getRequireSku(db))) {
    return NextResponse.json({ error: 'sku_required' }, { status: 400 });
  }
  try {
    const [row] = await db.insert(skus).values({ storeId, barcode, sku: skuInput || null, name }).returning();
    return NextResponse.json({ product: row }, { status: 201 });
  } catch (err: any) {
    if (err.code === '23505') {
      return NextResponse.json({ error: 'barcode_already_registered' }, { status: 409 });
    }
    throw err;
  }
}
