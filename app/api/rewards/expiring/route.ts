import { NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, sales } from '@/db/schema';
import { addDaysToIsoDate, todayIso } from '@/lib/dates';
import { calculateExpiresAt, calculateRewardCents } from '@/lib/rewards';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }

  const url = new URL(req.url);
  const today = todayIso();
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const from = fromParam && DATE_PATTERN.test(fromParam) ? fromParam : today;
  const to = toParam && DATE_PATTERN.test(toParam) ? toParam : addDaysToIsoDate(today, 10);
  const cashbackUsedParam = url.searchParams.get('cashbackUsed');
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE),
  );

  const conditions = [
    eq(sales.storeId, storeId),
    sql`${sales.saleDate} + interval '30 days' >= ${from}::date`,
    sql`${sales.saleDate} + interval '30 days' <= ${to}::date`,
  ];
  if (cashbackUsedParam === 'true') conditions.push(eq(sales.cashbackUsed, true));
  if (cashbackUsedParam === 'false') conditions.push(eq(sales.cashbackUsed, false));
  const whereClause = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(whereClause);

  const rows = await db
    .select({
      id: sales.id,
      saleDate: sales.saleDate,
      valueCents: sales.valueCents,
      cashbackUsed: sales.cashbackUsed,
      customerName: customers.name,
    })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(whereClause)
    .orderBy(desc(sales.saleDate), desc(sales.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const items = rows.map((r) => ({
    id: r.id,
    saleDate: r.saleDate,
    customerName: r.customerName,
    valueCents: r.valueCents,
    rewardCents: calculateRewardCents(r.valueCents),
    cashbackUsed: r.cashbackUsed,
    expiresAt: calculateExpiresAt(r.saleDate),
  }));

  return NextResponse.json({ items, total: count, page, pageSize, from, to });
}
