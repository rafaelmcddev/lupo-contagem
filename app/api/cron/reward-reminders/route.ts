import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, sales, stores, whatsappSends } from '@/db/schema';
import { formatCentsAsBRL } from '@/lib/currency';
import { formatDateBR } from '@/lib/dates';
import {
  CASHBACK_USABLE_AFTER_DAYS,
  DEFAULT_CASHBACK_EXPIRY_DAYS,
  DEFAULT_CASHBACK_PERCENT,
  calculateExpiresAt,
  calculateRewardCents,
} from '@/lib/rewards';
import { isWhatsAppApiConfigured, sendViaMetaApi } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'cron_secret_not_configured' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isWhatsAppApiConfigured()) {
    return NextResponse.json({ sent: 0, skipped: 'not_configured' });
  }

  // Sales span every store in one sweep, and each store may have its own
  // expiry window, so the "due" cutoff is computed per-row via a join
  // instead of a single global interval.
  const dueRows = await db
    .select({
      saleId: sales.id,
      storeId: sales.storeId,
      saleDate: sales.saleDate,
      valueCents: sales.valueCents,
      customerName: customers.name,
      customerPhone: customers.phone,
      cashbackPercent: stores.cashbackPercent,
      cashbackExpiryDays: stores.cashbackExpiryDays,
    })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .innerJoin(stores, eq(sales.storeId, stores.id))
    .where(
      and(
        eq(sales.cashbackUsed, false),
        // Cashback isn't usable right after the purchase (see lib/rewards.ts's
        // calculateExpiresAt), so the true expiry is the configured days plus
        // that delay. The reminder fires 5 days before that.
        sql`${sales.saleDate} + make_interval(days => coalesce(${stores.cashbackExpiryDays}, ${DEFAULT_CASHBACK_EXPIRY_DAYS}) + ${CASHBACK_USABLE_AFTER_DAYS} - 5) <= current_date`,
        sql`${sales.saleDate} + make_interval(days => coalesce(${stores.cashbackExpiryDays}, ${DEFAULT_CASHBACK_EXPIRY_DAYS}) + ${CASHBACK_USABLE_AFTER_DAYS}) > current_date`,
        sql`not exists (select 1 from whatsapp_sends ws where ws.sale_id = ${sales.id} and ws.type = 'reminder' and ws.trigger != 'manual')`,
      ),
    );

  let sentCount = 0;
  for (const row of dueRows) {
    const rewardCents = calculateRewardCents(row.valueCents, row.cashbackPercent ?? DEFAULT_CASHBACK_PERCENT);
    const expiresAt = calculateExpiresAt(row.saleDate, row.cashbackExpiryDays ?? DEFAULT_CASHBACK_EXPIRY_DAYS);
    const result = await sendViaMetaApi(row.customerPhone, [
      row.customerName,
      formatDateBR(row.saleDate),
      formatCentsAsBRL(rewardCents),
      formatDateBR(expiresAt),
    ]);
    await db.insert(whatsappSends).values({
      storeId: row.storeId,
      saleId: row.saleId,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      type: 'reminder',
      status: result.ok ? 'sent' : 'failed',
      trigger: 'auto',
      errorMessage: result.error ?? null,
    });
    if (result.ok) sentCount += 1;
  }

  return NextResponse.json({ sent: sentCount, checked: dueRows.length });
}
