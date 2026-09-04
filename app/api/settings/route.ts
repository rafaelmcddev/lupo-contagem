import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { settings } from '@/db/schema';
import { PREFIX_LENGTH_KEY, getPrefixLength } from '@/lib/getPrefixLength';
import { REQUIRE_SKU_KEY, getRequireSku } from '@/lib/getRequireSku';

export const dynamic = 'force-dynamic';

export async function GET() {
  const prefixLength = await getPrefixLength(db);
  const requireSku = await getRequireSku(db);
  return NextResponse.json({ prefixLength, requireSku });
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
  if (typeof body.requireSku !== 'boolean') {
    return NextResponse.json({ error: 'invalid_require_sku' }, { status: 400 });
  }
  await db
    .insert(settings)
    .values({ key: PREFIX_LENGTH_KEY, value: String(prefixLength) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(prefixLength) } });
  await db
    .insert(settings)
    .values({ key: REQUIRE_SKU_KEY, value: String(body.requireSku) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(body.requireSku) } });
  return NextResponse.json({ prefixLength, requireSku: body.requireSku });
}
