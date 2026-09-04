import { NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { skus } from '@/db/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await db.select().from(skus).orderBy(asc(skus.barcode));
  return NextResponse.json({ products: rows });
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const barcode = String(body.barcode ?? '').trim();
  const sku = String(body.sku ?? '').trim();
  const name = String(body.name ?? '').trim();
  if (!barcode || !sku || !name) {
    return NextResponse.json({ error: 'invalid_product' }, { status: 400 });
  }
  try {
    const [row] = await db.insert(skus).values({ barcode, sku, name }).returning();
    return NextResponse.json({ product: row }, { status: 201 });
  } catch (err: any) {
    if (err.code === '23505') {
      return NextResponse.json({ error: 'barcode_already_registered' }, { status: 409 });
    }
    throw err;
  }
}
