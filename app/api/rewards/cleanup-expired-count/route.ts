import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { sales } from '@/db/schema';
import { CASHBACK_USABLE_AFTER_DAYS } from '@/lib/rewards';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreCashbackSettings } from '@/lib/storeCashback';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }
  const { expiryDays } = await getStoreCashbackSettings(db, storeId);
  const trueExpiryDays = expiryDays + CASHBACK_USABLE_AFTER_DAYS;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sales)
    .where(
      and(
        eq(sales.storeId, storeId),
        eq(sales.cashbackUsed, false),
        sql`${sales.saleDate} + make_interval(days => ${trueExpiryDays}) <= current_date`,
      ),
    );

  return NextResponse.json({ count });
}
