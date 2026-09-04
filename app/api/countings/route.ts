import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { countings } from '@/db/schema';
import { getPrefixLength } from '@/lib/getPrefixLength';
import { getRequireSku } from '@/lib/getRequireSku';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const rows =
    status === 'active' || status === 'finished'
      ? await db.select().from(countings).where(eq(countings.status, status)).orderBy(desc(countings.startedAt))
      : await db.select().from(countings).orderBy(desc(countings.startedAt));
  return NextResponse.json({ countings: rows });
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
