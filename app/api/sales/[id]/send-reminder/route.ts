import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, sales, whatsappSends } from '@/db/schema';
import { calculateExpiresAt, calculateMinPurchaseToUseCents, calculateRewardCents } from '@/lib/rewards';
import { formatCentsAsBRL } from '@/lib/currency';
import { formatDateBR } from '@/lib/dates';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreCashbackSettings } from '@/lib/storeCashback';
import { getStoreIdFromRequest } from '@/lib/store';
import { buildRewardMessage } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }

  const rows = await db
    .select({
      saleId: sales.id,
      saleDate: sales.saleDate,
      valueCents: sales.valueCents,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(and(eq(sales.id, id), eq(sales.storeId, storeId)))
    .limit(1);
  const sale = rows[0];
  if (!sale) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { name: storeName, percent, expiryDays, maxUsagePercent, messageTemplate } = await getStoreCashbackSettings(db, storeId);
  const rewardCents = calculateRewardCents(sale.valueCents, percent);
  const expiresAt = calculateExpiresAt(sale.saleDate, expiryDays);
  const minPurchaseCents = calculateMinPurchaseToUseCents(rewardCents, maxUsagePercent);
  const message = buildRewardMessage({
    template: messageTemplate,
    storeName,
    customerName: sale.customerName,
    saleDateBR: formatDateBR(sale.saleDate),
    rewardBRL: formatCentsAsBRL(rewardCents),
    expiresAtBR: formatDateBR(expiresAt),
    maxUsagePercentText: `${maxUsagePercent}%`,
    minPurchaseBRL: formatCentsAsBRL(minPurchaseCents),
  });
  await db.insert(whatsappSends).values({
    storeId,
    saleId: sale.saleId,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    type: 'reminder',
    status: 'opened',
    trigger: 'manual',
  });

  // The URL depends on the requesting device (app vs web.whatsapp.com), so
  // it's built client-side — this just hands back the phone and text.
  return NextResponse.json({ phone: sale.customerPhone, message });
}
