import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { cashbackCleanupLog, sales } from '@/db/schema';
import { CASHBACK_USABLE_AFTER_DAYS } from '@/lib/rewards';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreCashbackSettings } from '@/lib/storeCashback';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }
  const { expiryDays } = await getStoreCashbackSettings(db, storeId);
  // Cashback isn't usable right after the purchase — see lib/rewards.ts's
  // calculateExpiresAt for the same rule applied here in SQL.
  const trueExpiryDays = expiryDays + CASHBACK_USABLE_AFTER_DAYS;

  const deleted = await db
    .delete(sales)
    .where(
      and(
        eq(sales.storeId, storeId),
        // A used cashback is a record of a real redemption — it must never
        // be purged, only the ones that expired unused are cleanup targets.
        eq(sales.cashbackUsed, false),
        sql`${sales.saleDate} + make_interval(days => ${trueExpiryDays}) <= current_date`,
      ),
    )
    .returning({ id: sales.id });

  const rowsDeleted = deleted.length;
  await db.insert(cashbackCleanupLog).values({ storeId, rowsDeleted });

  return NextResponse.json({ rowsDeleted });
}
