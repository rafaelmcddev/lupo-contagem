import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { settings, stores } from '@/db/schema';
import { PREFIX_LENGTH_KEY, getPrefixLength } from '@/lib/getPrefixLength';
import { REQUIRE_SKU_KEY, getRequireSku } from '@/lib/getRequireSku';
import { isMasterPasswordCorrect } from '@/lib/masterPassword';
import { getStoreCashbackSettings } from '@/lib/storeCashback';
import { getStoreIdFromRequest } from '@/lib/store';
import { isWhatsAppApiConfigured } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

const MIN_CASHBACK_EXPIRY_DAYS = 5; // keeps the fixed 5-day-before reminder window sane
const MAX_CASHBACK_EXPIRY_DAYS = 3650;

export async function GET(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  const prefixLength = await getPrefixLength(db);
  const requireSku = await getRequireSku(db);
  const {
    percent: cashbackPercent,
    expiryDays: cashbackExpiryDays,
    maxUsagePercent: cashbackMaxUsagePercent,
    messageTemplate: whatsappMessageTemplate,
  } = await getStoreCashbackSettings(db, storeId);
  return NextResponse.json({
    prefixLength,
    requireSku,
    cashbackPercent,
    cashbackExpiryDays,
    cashbackMaxUsagePercent,
    whatsappMessageTemplate,
    whatsappApiConfigured: isWhatsAppApiConfigured(),
  });
}

export async function PUT(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  // The master password is never cached (see lib/masterPassword.ts) — it's
  // sent fresh with every save instead of being checked via a cookie.
  if (!isMasterPasswordCorrect(String(body.masterPassword ?? ''))) {
    return NextResponse.json({ error: 'master_password_required' }, { status: 401 });
  }
  const prefixLength = Number(body.prefixLength);
  if (!Number.isInteger(prefixLength) || prefixLength < 1 || prefixLength > 20) {
    return NextResponse.json({ error: 'invalid_prefix_length' }, { status: 400 });
  }
  if (typeof body.requireSku !== 'boolean') {
    return NextResponse.json({ error: 'invalid_require_sku' }, { status: 400 });
  }
  const cashbackPercent = Number(body.cashbackPercent);
  if (!Number.isFinite(cashbackPercent) || cashbackPercent < 0 || cashbackPercent > 100) {
    return NextResponse.json({ error: 'invalid_cashback_percent' }, { status: 400 });
  }
  const cashbackExpiryDays = Number(body.cashbackExpiryDays);
  if (
    !Number.isInteger(cashbackExpiryDays) ||
    cashbackExpiryDays < MIN_CASHBACK_EXPIRY_DAYS ||
    cashbackExpiryDays > MAX_CASHBACK_EXPIRY_DAYS
  ) {
    return NextResponse.json({ error: 'invalid_cashback_expiry_days' }, { status: 400 });
  }
  const cashbackMaxUsagePercent = Number(body.cashbackMaxUsagePercent);
  if (!Number.isFinite(cashbackMaxUsagePercent) || cashbackMaxUsagePercent <= 0 || cashbackMaxUsagePercent > 100) {
    return NextResponse.json({ error: 'invalid_cashback_max_usage_percent' }, { status: 400 });
  }
  const whatsappMessageTemplate = String(body.whatsappMessageTemplate ?? '').trim();
  if (!whatsappMessageTemplate) {
    return NextResponse.json({ error: 'invalid_whatsapp_message_template' }, { status: 400 });
  }

  await db
    .insert(settings)
    .values({ key: PREFIX_LENGTH_KEY, value: String(prefixLength) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(prefixLength) } });
  await db
    .insert(settings)
    .values({ key: REQUIRE_SKU_KEY, value: String(body.requireSku) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(body.requireSku) } });
  await db
    .update(stores)
    .set({ cashbackPercent, cashbackExpiryDays, cashbackMaxUsagePercent, whatsappMessageTemplate })
    .where(eq(stores.id, storeId));

  return NextResponse.json({
    prefixLength,
    requireSku: body.requireSku,
    cashbackPercent,
    cashbackExpiryDays,
    cashbackMaxUsagePercent,
    whatsappMessageTemplate,
  });
}
