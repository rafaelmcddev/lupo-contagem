import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, sales, whatsappSends } from '@/db/schema';
import { calculateExpiresAt, calculateRewardCents } from '@/lib/rewards';
import { formatCentsAsBRL } from '@/lib/currency';
import { formatDateBR } from '@/lib/dates';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';
import { buildRewardMessage, buildWhatsAppWebUrl } from '@/lib/whatsapp';

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

  const rewardCents = calculateRewardCents(sale.valueCents);
  const expiresAt = calculateExpiresAt(sale.saleDate);
  const message = buildRewardMessage({
    customerName: sale.customerName,
    saleDateBR: formatDateBR(sale.saleDate),
    rewardBRL: formatCentsAsBRL(rewardCents),
    expiresAtBR: formatDateBR(expiresAt),
  });
  const whatsappUrl = buildWhatsAppWebUrl(sale.customerPhone, message);

  await db.insert(whatsappSends).values({
    storeId,
    saleId: sale.saleId,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    type: 'reminder',
    status: 'opened',
    trigger: 'manual',
  });

  return NextResponse.json({ whatsappUrl });
}
