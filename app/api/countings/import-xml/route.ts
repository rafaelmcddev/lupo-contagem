import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { countings, invoiceItems, skus } from '@/db/schema';
import { getPrefixLength } from '@/lib/getPrefixLength';
import { getRequireSku } from '@/lib/getRequireSku';
import { InvalidNfeXmlError, parseNfeXml } from '@/lib/parseNfeXml';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const xml = typeof body.xml === 'string' ? body.xml : '';
  if (!xml.trim()) {
    return NextResponse.json({ error: 'invalid_xml' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseNfeXml(xml);
  } catch (err) {
    if (err instanceof InvalidNfeXmlError) {
      return NextResponse.json({ error: 'invalid_xml', message: err.message }, { status: 400 });
    }
    throw err;
  }

  const name =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : `NF ${parsed.invoiceNumber}${parsed.supplierName ? ' — ' + parsed.supplierName : ''}`;

  const prefixLength = await getPrefixLength(db);
  const requireSku = await getRequireSku(db);

  // Keep the products catalog (skus table) up to date from the invoice, the
  // same way the CSV import does, so scans of these barcodes resolve to a
  // SKU/name without asking the person to type it in mid-count.
  let productsCreated = 0;
  let productsUpdated = 0;
  for (const item of parsed.items) {
    const existing = await db.select().from(skus).where(eq(skus.barcode, item.barcode)).limit(1);
    if (existing[0]) {
      await db.update(skus).set({ sku: item.sku, name: item.name }).where(eq(skus.barcode, item.barcode));
      productsUpdated++;
    } else {
      await db.insert(skus).values({ barcode: item.barcode, sku: item.sku, name: item.name });
      productsCreated++;
    }
  }

  const [counting] = await db
    .insert(countings)
    .values({
      name,
      prefixLengthUsed: prefixLength,
      requireSkuUsed: requireSku,
      status: 'active',
      source: 'xml',
      invoiceNumber: parsed.invoiceNumber,
      supplierName: parsed.supplierName,
    })
    .returning();

  if (parsed.items.length > 0) {
    await db.insert(invoiceItems).values(
      parsed.items.map((item) => ({
        countingId: counting.id,
        barcode: item.barcode,
        sku: item.sku,
        name: item.name,
        expectedQty: item.quantity,
      })),
    );
  }

  return NextResponse.json(
    {
      counting,
      itemsImported: parsed.items.length,
      productsCreated,
      productsUpdated,
      itemErrors: parsed.errors,
    },
    { status: 201 },
  );
}
