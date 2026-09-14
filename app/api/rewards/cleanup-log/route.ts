import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { cashbackCleanupLog } from '@/db/schema';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(cashbackCleanupLog)
    .where(eq(cashbackCleanupLog.storeId, storeId))
    .orderBy(desc(cashbackCleanupLog.ranAt));

  return NextResponse.json({ log: rows });
}
