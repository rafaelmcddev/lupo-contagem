import { NextResponse } from 'next/server';
import { and, asc, eq, notExists, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, sales, whatsappSends } from '@/db/schema';
import { CASHBACK_USABLE_AFTER_DAYS, calculateExpiresAt, calculateMinPurchaseToUseCents, calculateRewardCents } from '@/lib/rewards';
import { formatCentsAsBRL } from '@/lib/currency';
import { formatDateBR } from '@/lib/dates';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreCashbackSettings, type StoreCashbackSettings } from '@/lib/storeCashback';
import { getStoreIdFromRequest } from '@/lib/store';
import { buildRewardMessage, buildWhatsAppUrl, isWhatsAppApiConfigured } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

type PendingRow = { saleId: number; customerName: string; customerPhone: string; saleDate: string; valueCents: number };

function toItem(row: PendingRow, type: 'purchase' | 'reminder', storeSettings: StoreCashbackSettings) {
  const rewardCents = calculateRewardCents(row.valueCents, storeSettings.percent);
  const expiresAt = calculateExpiresAt(row.saleDate, storeSettings.expiryDays);
  const minPurchaseCents = calculateMinPurchaseToUseCents(rewardCents, storeSettings.maxUsagePercent);
  const message = buildRewardMessage({
    template: storeSettings.messageTemplate,
    storeName: storeSettings.name,
    customerName: row.customerName,
    saleDateBR: formatDateBR(row.saleDate),
    rewardBRL: formatCentsAsBRL(rewardCents),
    expiresAtBR: formatDateBR(expiresAt),
    maxUsagePercentText: `${storeSettings.maxUsagePercent}%`,
    minPurchaseBRL: formatCentsAsBRL(minPurchaseCents),
  });
  return {
    saleId: row.saleId,
    type,
    customerName: row.customerName,
    whatsappUrl: buildWhatsAppUrl(row.customerPhone, message),
  };
}

export async function GET(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }
  const storeSettings = await getStoreCashbackSettings(db, storeId);
  // Cashback isn't usable right after the purchase — see lib/rewards.ts's
  // calculateExpiresAt for the same rule applied here in SQL.
  const trueExpiryDays = storeSettings.expiryDays + CASHBACK_USABLE_AFTER_DAYS;

  const selectColumns = {
    saleId: sales.id,
    customerName: customers.name,
    customerPhone: customers.phone,
    saleDate: sales.saleDate,
    valueCents: sales.valueCents,
  };

  const pendingPurchases = await db
    .select(selectColumns)
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(
      and(
        eq(sales.storeId, storeId),
        sql`${sales.saleDate} + make_interval(days => ${trueExpiryDays}) > current_date`,
        notExists(
          db
            .select()
            .from(whatsappSends)
            .where(and(eq(whatsappSends.saleId, sales.id), eq(whatsappSends.type, 'purchase'))),
        ),
      ),
    )
    .orderBy(asc(sales.saleDate))
    .limit(50);

  const pendingReminders = isWhatsAppApiConfigured()
    ? []
    : await db
        .select(selectColumns)
        .from(sales)
        .innerJoin(customers, eq(sales.customerId, customers.id))
        .where(
          and(
            eq(sales.storeId, storeId),
            eq(sales.cashbackUsed, false),
            // The reminder fires 5 days before whatever this store's expiry is.
            sql`${sales.saleDate} + make_interval(days => ${trueExpiryDays - 5}) <= current_date`,
            sql`${sales.saleDate} + make_interval(days => ${trueExpiryDays}) > current_date`,
            // Unlike the cron route (which only ever runs once the Meta API is
            // configured, and deliberately still sends the "official"
            // automatic reminder even after an earlier manual one), this
            // queue only exists BECAUSE the API isn't configured — there is
            // no automatic mechanism left to run later. Any prior reminder
            // for this sale, manual or not, already means a human took care
            // of it, so it must not keep resurfacing here.
            notExists(
              db
                .select()
                .from(whatsappSends)
                .where(and(eq(whatsappSends.saleId, sales.id), eq(whatsappSends.type, 'reminder'))),
            ),
          ),
        )
        .orderBy(asc(sales.saleDate))
        .limit(50);

  const pending = [
    ...pendingPurchases.map((r) => toItem(r, 'purchase', storeSettings)),
    ...pendingReminders.map((r) => toItem(r, 'reminder', storeSettings)),
  ];

  return NextResponse.json({ pending });
}
