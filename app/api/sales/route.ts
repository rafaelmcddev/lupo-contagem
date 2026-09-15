import { NextResponse } from 'next/server';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, sales, whatsappSends } from '@/db/schema';
import { formatCentsAsBRL } from '@/lib/currency';
import { formatDateBR } from '@/lib/dates';
import { calculateExpiresAt, calculateRewardCents } from '@/lib/rewards';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreCashbackSettings } from '@/lib/storeCashback';
import { getStoreIdFromRequest } from '@/lib/store';
import { isWhatsAppApiConfigured, sendViaMetaApi } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 100;
const SALE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE),
  );
  // "recent" (default) shows the newest purchase first; "name" sorts
  // alphabetically by customer name, falling back to most-recent-first
  // among sales from the same customer.
  const sort = url.searchParams.get('sort') === 'name' ? 'name' : 'recent';
  const orderClauses = sort === 'name' ? [asc(customers.name), desc(sales.saleDate)] : [desc(sales.saleDate), desc(sales.id)];

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(sales).where(eq(sales.storeId, storeId));
  const rows = await db
    .select({
      id: sales.id,
      saleDate: sales.saleDate,
      valueCents: sales.valueCents,
      customerId: sales.customerId,
      customerName: customers.name,
      cashbackUsed: sales.cashbackUsed,
    })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(eq(sales.storeId, storeId))
    .orderBy(...orderClauses)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return NextResponse.json({ sales: rows, total: count, page, pageSize, sort });
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

  const customerId = Number(body.customerId);
  const saleDate = String(body.saleDate ?? '');
  const valueCents = Number(body.valueCents);

  if (!Number.isInteger(customerId)) {
    return NextResponse.json({ error: 'invalid_customer' }, { status: 400 });
  }
  if (!SALE_DATE_PATTERN.test(saleDate)) {
    return NextResponse.json({ error: 'invalid_date' }, { status: 400 });
  }
  if (!Number.isInteger(valueCents) || valueCents <= 0) {
    return NextResponse.json({ error: 'invalid_value' }, { status: 400 });
  }

  const customerRows = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phone })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.storeId, storeId)))
    .limit(1);
  const customer = customerRows[0];
  if (!customer) {
    return NextResponse.json({ error: 'invalid_customer' }, { status: 400 });
  }

  const [row] = await db.insert(sales).values({ storeId, customerId, saleDate, valueCents }).returning();

  if (isWhatsAppApiConfigured()) {
    try {
      const { percent, expiryDays } = await getStoreCashbackSettings(db, storeId);
      const rewardCents = calculateRewardCents(valueCents, percent);
      const expiresAt = calculateExpiresAt(saleDate, expiryDays);
      const result = await sendViaMetaApi(customer.phone, [
        customer.name,
        formatDateBR(saleDate),
        formatCentsAsBRL(rewardCents),
        formatDateBR(expiresAt),
      ]);
      await db.insert(whatsappSends).values({
        storeId,
        saleId: row.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        type: 'purchase',
        status: result.ok ? 'sent' : 'failed',
        trigger: 'auto',
        errorMessage: result.error ?? null,
      });
    } catch {
      // Best-effort: the sale above is already committed. A WhatsApp or
      // logging failure here must never affect the response to the client.
    }
  }

  return NextResponse.json({ sale: row }, { status: 201 });
}
