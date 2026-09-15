import { NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, sales } from '@/db/schema';
import { addDaysToIsoDate, todayIso } from '@/lib/dates';
import { CASHBACK_USABLE_AFTER_DAYS, calculateExpiresAt, calculateMinPurchaseToUseCents, calculateRewardCents } from '@/lib/rewards';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreCashbackSettings } from '@/lib/storeCashback';
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
  const { percent, expiryDays, maxUsagePercent } = await getStoreCashbackSettings(db, storeId);
  // Cashback isn't usable right after the purchase — see lib/rewards.ts's
  // calculateExpiresAt for the same rule applied here in SQL.
  const trueExpiryDays = expiryDays + CASHBACK_USABLE_AFTER_DAYS;

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
    sql`${sales.saleDate} + make_interval(days => ${trueExpiryDays}) >= ${from}::date`,
    sql`${sales.saleDate} + make_interval(days => ${trueExpiryDays}) <= ${to}::date`,
  ];
  if (cashbackUsedParam === 'true') conditions.push(eq(sales.cashbackUsed, true));
  if (cashbackUsedParam === 'false') conditions.push(eq(sales.cashbackUsed, false));
  const whereClause = and(...conditions);

  const [{ count, totalValueCents }] = await db
    .select({ count: sql<number>`count(*)::int`, totalValueCents: sql<number>`coalesce(sum(${sales.valueCents}), 0)::int` })
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

  const items = rows.map((r) => {
    const rewardCents = calculateRewardCents(r.valueCents, percent);
    return {
      id: r.id,
      saleDate: r.saleDate,
      customerName: r.customerName,
      valueCents: r.valueCents,
      rewardCents,
      cashbackUsed: r.cashbackUsed,
      expiresAt: calculateExpiresAt(r.saleDate, expiryDays),
      minPurchaseCents: calculateMinPurchaseToUseCents(rewardCents, maxUsagePercent),
    };
  });

  return NextResponse.json({
    items,
    total: count,
    page,
    pageSize,
    from,
    to,
    maxUsagePercent,
    // Totals reflect every sale matching the filters, not just this page.
    totalValueCents,
    totalRewardCents: calculateRewardCents(totalValueCents, percent),
  });
}
