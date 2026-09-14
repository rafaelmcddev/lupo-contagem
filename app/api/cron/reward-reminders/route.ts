import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, sales, whatsappSends } from '@/db/schema';
import { formatCentsAsBRL } from '@/lib/currency';
import { formatDateBR } from '@/lib/dates';
import { calculateExpiresAt, calculateRewardCents } from '@/lib/rewards';
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

  const dueRows = await db
    .select({
      saleId: sales.id,
      storeId: sales.storeId,
      saleDate: sales.saleDate,
      valueCents: sales.valueCents,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(
      and(
        eq(sales.cashbackUsed, false),
        sql`${sales.saleDate} + interval '25 days' <= current_date`,
        sql`${sales.saleDate} + interval '30 days' > current_date`,
        sql`not exists (select 1 from whatsapp_sends ws where ws.sale_id = ${sales.id} and ws.type = 'reminder' and ws.trigger != 'manual')`,
      ),
    );

  let sentCount = 0;
  for (const row of dueRows) {
    const rewardCents = calculateRewardCents(row.valueCents);
    const expiresAt = calculateExpiresAt(row.saleDate);
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
