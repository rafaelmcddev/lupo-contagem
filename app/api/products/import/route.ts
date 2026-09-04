import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { skus } from '@/db/schema';
import { InvalidCsvHeaderError, parseProductsCsv } from '@/lib/parseProductsCsv';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const csv = typeof body.csv === 'string' ? body.csv : '';

  let parsed;
  try {
    parsed = parseProductsCsv(csv);
  } catch (err) {
    if (err instanceof InvalidCsvHeaderError) {
      return NextResponse.json({ error: 'invalid_csv_header' }, { status: 400 });
    }
    throw err;
  }

  let created = 0;
  let updated = 0;
  for (const row of parsed.rows) {
    const existing = await db.select().from(skus).where(eq(skus.barcode, row.barcode)).limit(1);
    if (existing[0]) {
      await db.update(skus).set({ sku: row.sku, name: row.name }).where(eq(skus.barcode, row.barcode));
      updated++;
    } else {
      await db.insert(skus).values({ barcode: row.barcode, sku: row.sku, name: row.name });
      created++;
    }
  }

  return NextResponse.json({ created, updated, errors: parsed.errors });
}
