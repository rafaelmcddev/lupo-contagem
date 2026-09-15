import { NextResponse } from 'next/server';
import { and, asc, eq, notExists, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, sales, whatsappSends } from '@/db/schema';
import { calculateExpiresAt, calculateRewardCents } from '@/lib/rewards';
import { formatCentsAsBRL } from '@/lib/currency';
import { formatDateBR } from '@/lib/dates';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';
import { buildRewardMessage, buildWhatsAppWebUrl, isWhatsAppApiConfigured } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

type PendingRow = { saleId: number; customerName: string; customerPhone: string; saleDate: string; valueCents: number };

function toItem(row: PendingRow, type: 'purchase' | 'reminder') {
  const rewardCents = calculateRewardCents(row.valueCents);
  const expiresAt = calculateExpiresAt(row.saleDate);
  const message = buildRewardMessage({
    customerName: row.customerName,
    saleDateBR: formatDateBR(row.saleDate),
    rewardBRL: formatCentsAsBRL(rewardCents),
    expiresAtBR: formatDateBR(expiresAt),
  });
  return {
    saleId: row.saleId,
    type,
    customerName: row.customerName,
    whatsappUrl: buildWhatsAppWebUrl(row.customerPhone, message),
  };
}

export async function GET(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }

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
        sql`${sales.saleDate} + interval '30 days' > current_date`,
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
            sql`${sales.saleDate} + interval '25 days' <= current_date`,
            sql`${sales.saleDate} + interval '30 days' > current_date`,
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
    ...pendingPurchases.map((r) => toItem(r, 'purchase')),
    ...pendingReminders.map((r) => toItem(r, 'reminder')),
  ];

  return NextResponse.json({ pending });
}
