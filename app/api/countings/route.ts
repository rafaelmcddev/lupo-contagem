import { NextResponse } from 'next/server';
import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { countings } from '@/db/schema';
import { getPrefixLength } from '@/lib/getPrefixLength';
import { getRequireSku } from '@/lib/getRequireSku';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const q = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE),
  );

  const conditions = [];
  if (status === 'active' || status === 'finished') conditions.push(eq(countings.status, status));
  if (q) conditions.push(ilike(countings.name, `%${q}%`));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(countings).where(where);
  const rows = await db
    .select()
    .from(countings)
    .where(where)
    .orderBy(desc(countings.startedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return NextResponse.json({ countings: rows, total: count, page, pageSize });
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const name = String(body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  }
  const prefixLength = await getPrefixLength(db);
  const requireSku = await getRequireSku(db);
  const [row] = await db
    .insert(countings)
    .values({ name, prefixLengthUsed: prefixLength, requireSkuUsed: requireSku, status: 'active' })
    .returning();
  return NextResponse.json({ counting: row }, { status: 201 });
}
