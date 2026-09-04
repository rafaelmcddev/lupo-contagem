import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { settings } from '@/db/schema';
import { PREFIX_LENGTH_KEY, getPrefixLength } from '@/lib/getPrefixLength';

export const dynamic = 'force-dynamic';

export async function GET() {
  const prefixLength = await getPrefixLength(db);
  return NextResponse.json({ prefixLength });
}

export async function PUT(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const prefixLength = Number(body.prefixLength);
  if (!Number.isInteger(prefixLength) || prefixLength < 1 || prefixLength > 20) {
    return NextResponse.json({ error: 'invalid_prefix_length' }, { status: 400 });
  }
  await db
    .insert(settings)
    .values({ key: PREFIX_LENGTH_KEY, value: String(prefixLength) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(prefixLength) } });
  return NextResponse.json({ prefixLength });
}
