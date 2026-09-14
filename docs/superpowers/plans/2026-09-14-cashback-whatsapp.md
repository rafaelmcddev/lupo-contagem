# Cashback: Cálculo, Relatório e WhatsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calculate the 5% cashback per sale, let staff mark it as used, build the
expiring-rewards report with cleanup, and automate the WhatsApp notification — with
a fallback (WhatsApp Web queue) that works today and switches itself off once the
Meta Cloud API is configured.

**Architecture:** Reward amount and expiry date are always derived on the fly
(`lib/rewards.ts`), never stored. A new `whatsapp_sends` log table records every
send attempt (auto via Meta, or "opened" via WhatsApp Web), and a
`cashback_cleanup_log` table records cleanup runs. `lib/whatsapp.ts` is the single
place that knows how to build a WhatsApp Web link or call the Meta API; every route
that sends a message goes through it. `isWhatsAppApiConfigured()` (env-var based)
is the single switch between "automatic" and "queue" behavior — nothing else
branches on mode.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM + Postgres, Vitest + RTL, Vercel
Cron.

**Spec:** `docs/superpowers/specs/2026-09-14-cashback-whatsapp-design.md`

## Global Constraints

- Every new `app/api/**/route.ts` file MUST export `export const dynamic =
  'force-dynamic';` — enforced project-wide by `app/api/dynamicConfig.test.ts`,
  which fails the whole suite if any route file lacks it.
- Every route except the cron route follows the existing PIN-gate pattern:
  `getStoreIdFromRequest(req)` then `isSalePinUnlocked(req, storeId)` returning 401
  `{ error: 'sale_pin_required' }` before touching the database. The cron route
  (`GET /api/cron/reward-reminders`) is the one exception — it has no store cookie
  context (Vercel Cron calls it directly) and is gated by `CRON_SECRET` instead.
- Reward amount (5% of `valueCents`, rounded) and expiry date (`saleDate` + 30
  days) are always computed via `lib/rewards.ts`'s `calculateRewardCents`/
  `calculateExpiresAt` — never re-implemented inline in a route or component.
- Any WhatsApp send (via `lib/whatsapp.ts`'s `sendViaMetaApi`) is best-effort: a
  failure must never throw out of the route that triggered it, and must never
  prevent the primary action (sale creation, cron sweep) from completing. Wrap in
  try/catch; log the outcome (`sent` | `failed`) to `whatsapp_sends` either way.
- New tables scope to a store via a `store_id` column + FK to `stores`, same as
  every existing table — except `whatsapp_sends.sale_id`, which uses `ON DELETE
  SET NULL` (not `cascade`) so the send log survives the sale being hard-deleted
  by the cleanup job.
- Tests use the real local Postgres (via `resetDb()`), same as the rest of this
  project — never mock the database. `fetch` IS mocked for `sendViaMetaApi` calls
  (there is no real Meta account to call in tests or in CI).
- Money is always cents (`integer`) end-to-end, formatted only at the last step
  via `formatCentsAsBRL`, matching the rest of the codebase.

---

### Task 1: Schema — `cashback_used`, `whatsapp_sends`, `cashback_cleanup_log`

**Files:**
- Modify: `db/schema.ts`
- Modify: `tests/resetDb.ts`
- Modify: `db/schema.test.ts`
- Create: `db/migrations/000X_*.sql` (generated, not hand-written)

**Interfaces:**
- Produces: `sales.cashbackUsed: boolean` (Drizzle column), `whatsappSends` table
  (`storeId`, `saleId` nullable, `customerName`, `customerPhone`, `type`
  (`'purchase' | 'reminder'`), `status` (`'sent' | 'opened' | 'failed'`),
  `trigger: text`, `errorMessage: text | null`, `sentAt`), `cashbackCleanupLog`
  table (`storeId`, `ranAt`, `rowsDeleted: integer`). Every later task that reads or
  writes these imports them from `@/db/schema`.

- [ ] **Step 1: Add the two new enums and the `cashback_used` column**

In `db/schema.ts`, near the other `pgEnum` declarations at the top:

```ts
export const whatsappSendType = pgEnum('whatsapp_send_type', ['purchase', 'reminder']);
export const whatsappSendStatus = pgEnum('whatsapp_send_status', ['sent', 'opened', 'failed']);
```

In the `sales` table definition, add a column after `valueCents`:

```ts
    cashbackUsed: boolean('cashback_used').notNull().default(false),
```

- [ ] **Step 2: Add the two new tables**

After the `sales` table definition in `db/schema.ts`:

```ts
export const whatsappSends = pgTable('whatsapp_sends', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').notNull().references(() => stores.id),
  saleId: integer('sale_id').references(() => sales.id, { onDelete: 'set null' }),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  type: whatsappSendType('type').notNull(),
  status: whatsappSendStatus('status').notNull(),
  trigger: text('trigger').notNull(),
  errorMessage: text('error_message'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cashbackCleanupLog = pgTable('cashback_cleanup_log', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').notNull().references(() => stores.id),
  ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
  rowsDeleted: integer('rows_deleted').notNull(),
});
```

- [ ] **Step 3: Generate and run the migration**

Run: `npm run db:generate`
Expected: a new file `db/migrations/000X_*.sql` containing `ALTER TABLE "sales" ADD
COLUMN "cashback_used" boolean DEFAULT false NOT NULL;`, `CREATE TYPE
"whatsapp_send_type"...`, `CREATE TYPE "whatsapp_send_status"...`, `CREATE TABLE
"whatsapp_sends"...` (with the FK using `ON DELETE set null`), `CREATE TABLE
"cashback_cleanup_log"...`. No other table should appear in the generated SQL —
if it does, stop and check nothing else in `db/schema.ts` was accidentally
touched.

Run: `npm run db:migrate`
Expected: `Migrations applied` against the local dev database.

- [ ] **Step 4: Include the new tables in test cleanup**

In `tests/resetDb.ts`, add both new tables to the `TRUNCATE` list:

```ts
export async function resetDb() {
  await db.execute(sql`TRUNCATE TABLE scans, boxes, countings, groups, settings, skus, customers, sales, whatsapp_sends, cashback_cleanup_log RESTART IDENTITY CASCADE`);
}
```

Without this, rows from one test file's `whatsapp_sends`/`cashback_cleanup_log`
inserts leak into the next test file (they share one Postgres instance, per this
project's existing convention).

- [ ] **Step 5: Write the failing tests**

Add to `db/schema.test.ts` (extend the existing imports at the top to include
`sales`, `whatsappSends`, `cashbackCleanupLog` alongside what's already imported
from `./schema`, and `customers` alongside `stores` etc.), inside the existing
`describe('schema', ...)` block:

```ts
  it('defaults cashback_used to false on a new sale', async () => {
    const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '99999-0000' }).returning();
    const [sale] = await db
      .insert(sales)
      .values({ storeId, customerId: customer.id, saleDate: '2026-09-14', valueCents: 4590 })
      .returning();
    expect(sale.cashbackUsed).toBe(false);
  });

  it('logs a whatsapp send tied to a sale, and keeps the log row when the sale is deleted', async () => {
    const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '99999-0000' }).returning();
    const [sale] = await db
      .insert(sales)
      .values({ storeId, customerId: customer.id, saleDate: '2026-09-14', valueCents: 4590 })
      .returning();
    const [sent] = await db
      .insert(whatsappSends)
      .values({
        storeId,
        saleId: sale.id,
        customerName: 'Ana',
        customerPhone: '99999-0000',
        type: 'purchase',
        status: 'sent',
        trigger: 'auto',
      })
      .returning();
    expect(sent.saleId).toBe(sale.id);

    await db.delete(sales).where(eq(sales.id, sale.id));

    const [afterDelete] = await db.select().from(whatsappSends).where(eq(whatsappSends.id, sent.id));
    expect(afterDelete).toBeDefined();
    expect(afterDelete.saleId).toBeNull();
  });

  it('logs a cleanup run with the count of rows removed', async () => {
    const [log] = await db.insert(cashbackCleanupLog).values({ storeId, rowsDeleted: 3 }).returning();
    expect(log.rowsDeleted).toBe(3);
    expect(log.ranAt).toBeInstanceOf(Date);
  });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run db/schema.test.ts`
Expected: all pass, including the 3 new ones.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all green — this step also proves Step 4's `resetDb` change didn't break
any other test file that relies on a clean database between tests.

- [ ] **Step 8: Commit**

```bash
git add db/schema.ts db/migrations tests/resetDb.ts db/schema.test.ts
git commit -m "feat: add cashback_used column and whatsapp_sends/cashback_cleanup_log tables"
```

---

### Task 2: `lib/dates.ts` additions + `lib/rewards.ts`

**Files:**
- Modify: `lib/dates.ts`
- Modify: `lib/dates.test.ts`
- Modify: `app/recompensas/page.tsx`
- Create: `lib/rewards.ts`
- Create: `lib/rewards.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `todayIso(): string`, `addDaysToIsoDate(isoDate: string, days: number):
  string` from `@/lib/dates`; `calculateRewardCents(valueCents: number): number`,
  `calculateExpiresAt(saleDate: string): string` from `@/lib/rewards`. Every later
  task that needs "today" as an ISO string, date arithmetic, or the reward
  formula uses these — never reimplements them.

- [ ] **Step 1: Write the failing tests**

Add to `lib/dates.test.ts` (new `describe` blocks, same file, after the existing
`formatDateBR` describe):

```ts
describe('addDaysToIsoDate', () => {
  it('adds days within the same month', () => {
    expect(addDaysToIsoDate('2026-09-01', 10)).toBe('2026-09-11');
  });

  it('rolls over into the next month', () => {
    expect(addDaysToIsoDate('2026-09-25', 10)).toBe('2026-10-05');
  });

  it('rolls over into the next year', () => {
    expect(addDaysToIsoDate('2026-12-28', 10)).toBe('2027-01-07');
  });
});

describe('todayIso', () => {
  it('returns a string matching YYYY-MM-DD', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

Add the corresponding imports at the top of `lib/dates.test.ts`: `import {
addDaysToIsoDate, formatDateBR, todayIso } from './dates';` (replacing the
existing narrower import).

Create `lib/rewards.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { calculateExpiresAt, calculateRewardCents } from './rewards';

describe('calculateRewardCents', () => {
  it('returns 5% of the value, rounded to the nearest cent', () => {
    expect(calculateRewardCents(4590)).toBe(230); // 229.5 -> 230
    expect(calculateRewardCents(10000)).toBe(500);
    expect(calculateRewardCents(1)).toBe(0); // 0.05 -> 0
  });
});

describe('calculateExpiresAt', () => {
  it('adds 30 days to the sale date', () => {
    expect(calculateExpiresAt('2026-09-14')).toBe('2026-10-14');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/dates.test.ts lib/rewards.test.ts`
Expected: FAIL — `addDaysToIsoDate`/`todayIso` not exported yet, `lib/rewards.ts`
doesn't exist yet.

- [ ] **Step 3: Implement `lib/dates.ts` additions**

Add to `lib/dates.ts` (keep the existing `formatDateBR` untouched):

```ts
export function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Implement `lib/rewards.ts`**

```ts
import { addDaysToIsoDate } from '@/lib/dates';

export function calculateRewardCents(valueCents: number): number {
  return Math.round(valueCents * 0.05);
}

export function calculateExpiresAt(saleDate: string): string {
  return addDaysToIsoDate(saleDate, 30);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/dates.test.ts lib/rewards.test.ts`
Expected: all PASS.

- [ ] **Step 6: De-duplicate `todayIso` in `app/recompensas/page.tsx`**

This file currently defines its own local `todayIso()` function (identical logic,
predating this plan). Replace it with the shared one to avoid two copies of the
same date logic drifting apart:

Remove this block from `app/recompensas/page.tsx`:

```ts
function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

Add `todayIso` to the existing `import { formatDateBR } from '@/lib/dates';` line,
making it `import { formatDateBR, todayIso } from '@/lib/dates';`. Nothing else in
the file changes — every call site (`useState(todayIso())`, `setSaleDate(todayIso())`)
keeps working identically since the function's behavior is unchanged, only its
location moved.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all green, including `app/recompensas/page.test.tsx` unchanged (the
`todayIso` refactor is behavior-preserving).

- [ ] **Step 8: Commit**

```bash
git add lib/dates.ts lib/dates.test.ts lib/rewards.ts lib/rewards.test.ts app/recompensas/page.tsx
git commit -m "feat: add date-math helpers and reward calculation (5%, 30-day expiry)"
```

---

### Task 3: `lib/whatsapp.ts`

**Files:**
- Create: `lib/whatsapp.ts`
- Create: `lib/whatsapp.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `isWhatsAppApiConfigured(): boolean`, `buildRewardMessage(params: {
  customerName: string; saleDateBR: string; rewardBRL: string; expiresAtBR: string
  }): string`, `buildWhatsAppWebUrl(phone: string, text: string): string`,
  `sendViaMetaApi(phone: string, templateParams: string[]): Promise<{ ok: boolean;
  error?: string }>` from `@/lib/whatsapp`. Tasks 5-11 all import from here for
  every WhatsApp-related action — no route or component builds a message or a
  WhatsApp URL by hand.

- [ ] **Step 1: Write the failing tests**

Create `lib/whatsapp.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRewardMessage, buildWhatsAppWebUrl, isWhatsAppApiConfigured, sendViaMetaApi } from './whatsapp';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('isWhatsAppApiConfigured', () => {
  it('is false when the env vars are not set', () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', '');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', '');
    expect(isWhatsAppApiConfigured()).toBe(false);
  });

  it('is true only when both the token and the phone number id are set', () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', '');
    expect(isWhatsAppApiConfigured()).toBe(false);

    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    expect(isWhatsAppApiConfigured()).toBe(true);
  });
});

describe('buildRewardMessage', () => {
  it('substitutes every placeholder in the standard template', () => {
    const message = buildRewardMessage({
      customerName: 'Ana',
      saleDateBR: '14/09/2026',
      rewardBRL: 'R$ 2,30',
      expiresAtBR: '14/10/2026',
    });
    expect(message).toContain('Olá, Ana!');
    expect(message).toContain('realizada no dia 14/09/2026');
    expect(message).toContain('gerou R$ 2,30 de crédito');
    expect(message).toContain('utilizar esse valor até: 14/10/2026');
    expect(message).not.toContain('%nome%');
    expect(message).not.toContain('%dia%');
    expect(message).not.toContain('%cashback%');
    expect(message).not.toContain('%data_limite%');
  });
});

describe('buildWhatsAppWebUrl', () => {
  it('strips formatting from the phone, prefixes the country code, and encodes the text', () => {
    const url = buildWhatsAppWebUrl('(67) 99999-0000', 'Olá!');
    expect(url).toBe('https://web.whatsapp.com/send?phone=5567999990000&text=Ol%C3%A1!');
  });

  it('does not double the country code if already present', () => {
    const url = buildWhatsAppWebUrl('55 67 99999-0000', 'oi');
    expect(url).toContain('phone=5567999990000');
  });
});

describe('sendViaMetaApi', () => {
  it('returns not_configured when env vars are missing', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', '');
    const result = await sendViaMetaApi('67999990000', ['Ana', '14/09/2026', 'R$ 2,30', '14/10/2026']);
    expect(result).toEqual({ ok: false, error: 'not_configured' });
  });

  it('returns ok:true on a successful Meta response', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    const result = await sendViaMetaApi('67999990000', ['Ana', '14/09/2026', 'R$ 2,30', '14/10/2026']);
    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v18.0/phone-id/messages',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns ok:false with the Meta error message on a failed response', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { message: 'Invalid template' } }) }),
    );

    const result = await sendViaMetaApi('67999990000', ['Ana', '14/09/2026', 'R$ 2,30', '14/10/2026']);
    expect(result).toEqual({ ok: false, error: 'Invalid template' });
  });

  it('returns ok:false instead of throwing when fetch itself rejects', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await sendViaMetaApi('67999990000', ['Ana', '14/09/2026', 'R$ 2,30', '14/10/2026']);
    expect(result).toEqual({ ok: false, error: 'network down' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/whatsapp.test.ts`
Expected: FAIL — `lib/whatsapp.ts` doesn't exist yet.

- [ ] **Step 3: Implement `lib/whatsapp.ts`**

```ts
const REWARD_MESSAGE_TEMPLATE = `Olá, %nome%! 👋

Agradecemos por escolher a loja Up! 💙

Temos uma boa notícia para você! 🎉

Sua compra realizada no dia %dia% gerou R$ %cashback% de crédito para desconto em sua próxima compra.

📅 Você pode utilizar esse valor até: %data_limite%

É só visitar nossa loja física e aproveitar o seu crédito para pagar menos na sua próxima compra! 😊

Após essa data, o crédito não poderá mais ser utilizado.

Esperamos você! 💙`;

export function isWhatsAppApiConfigured(): boolean {
  return Boolean(process.env.META_WHATSAPP_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID);
}

export function buildRewardMessage(params: {
  customerName: string;
  saleDateBR: string;
  rewardBRL: string;
  expiresAtBR: string;
}): string {
  return REWARD_MESSAGE_TEMPLATE.replace('%nome%', params.customerName)
    .replace('%dia%', params.saleDateBR)
    .replace('%cashback%', params.rewardBRL)
    .replace('%data_limite%', params.expiresAtBR);
}

function toE164Digits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export function buildWhatsAppWebUrl(phone: string, text: string): string {
  return `https://web.whatsapp.com/send?phone=${toE164Digits(phone)}&text=${encodeURIComponent(text)}`;
}

export async function sendViaMetaApi(
  phone: string,
  templateParams: string[],
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.META_WHATSAPP_TEMPLATE_NAME;
  if (!token || !phoneNumberId || !templateName) {
    return { ok: false, error: 'not_configured' };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toE164Digits(phone),
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'pt_BR' },
          components: [
            {
              type: 'body',
              parameters: templateParams.map((text) => ({ type: 'text', text })),
            },
          ],
        },
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error?.message ?? `http_${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown_error' };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/whatsapp.test.ts`
Expected: all PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add lib/whatsapp.ts lib/whatsapp.test.ts
git commit -m "feat: add WhatsApp message building, WhatsApp Web links, and Meta Cloud API sending"
```

---

### Task 4: `PUT /api/sales/:id` — accept the `cashbackUsed` toggle

**Files:**
- Modify: `app/api/sales/[id]/route.ts`
- Modify: `app/api/sales/[id]/route.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PUT /api/sales/:id` with body `{ cashbackUsed: boolean }` (and nothing
  else) now toggles just that field, returning `{ sale }`. The existing full-edit
  contract (`{ customerId, saleDate, valueCents }`) is unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `app/api/sales/[id]/route.test.ts` (check the existing file's `beforeEach`/
helper setup first — reuse whatever `createSale`/`putReq`-style helpers already
exist there rather than duplicating them):

```ts
  it('toggles cashback_used on its own, without touching customer/date/value', async () => {
    const sale = await createSale(); // however the existing file creates a test sale
    const res = await PUT(putReq({ cashbackUsed: true }), { params: { id: String(sale.id) } });
    const data = await res.json();
    expect(data.sale.cashbackUsed).toBe(true);
    expect(data.sale.customerId).toBe(sale.customerId);
    expect(data.sale.saleDate).toBe(sale.saleDate);
    expect(data.sale.valueCents).toBe(sale.valueCents);
  });

  it('toggles cashback_used back to false', async () => {
    const sale = await createSale();
    await PUT(putReq({ cashbackUsed: true }), { params: { id: String(sale.id) } });
    const res = await PUT(putReq({ cashbackUsed: false }), { params: { id: String(sale.id) } });
    const data = await res.json();
    expect(data.sale.cashbackUsed).toBe(false);
  });

  it('returns 404 toggling cashback_used on a sale from a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const sale = await createSale(otherStoreId);
    const res = await PUT(putReq({ cashbackUsed: true }), { params: { id: String(sale.id) } });
    expect(res.status).toBe(404);
  });
```

(Adapt the exact helper names/signatures to whatever `app/api/sales/[id]/route.test.ts` already defines — do not invent new ones if an equivalent already exists.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/api/sales/[id]/route.test.ts`
Expected: the 3 new tests FAIL (the route doesn't understand `cashbackUsed` yet —
it currently requires `customerId`/`saleDate`/`valueCents` and would 400 on a
`cashbackUsed`-only body).

- [ ] **Step 3: Implement**

In `app/api/sales/[id]/route.ts`, inside the `PUT` handler, right after the
`body = await req.json()` block and before the existing `customerId`/`saleDate`/
`valueCents` extraction, add:

```ts
  // The cashback-used toggle sends only { cashbackUsed }, without the rest of
  // the sale's fields — handled separately so it doesn't need to re-send (and
  // re-validate) customer/date/value just to flip one boolean.
  const isToggleOnly = body.cashbackUsed !== undefined && body.customerId === undefined && body.saleDate === undefined && body.valueCents === undefined;
  if (isToggleOnly) {
    const [row] = await db
      .update(sales)
      .set({ cashbackUsed: Boolean(body.cashbackUsed) })
      .where(and(eq(sales.id, id), eq(sales.storeId, storeId)))
      .returning();
    if (!row) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ sale: row });
  }
```

Everything below this (the existing `customerId`/`saleDate`/`valueCents`
validation and update) stays exactly as it is.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/api/sales/[id]/route.test.ts`
Expected: all PASS, including every pre-existing test in the file (the new branch
only triggers on a `cashbackUsed`-only body, so the full-edit path is untouched).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/api/sales/[id]/route.ts app/api/sales/[id]/route.test.ts
git commit -m "feat: let PUT /api/sales/:id toggle cashback_used on its own"
```

---

### Task 5: `POST /api/sales` — best-effort purchase-confirmation send

**Files:**
- Modify: `app/api/sales/route.ts`
- Modify: `app/api/sales/route.test.ts`

**Interfaces:**
- Consumes: `isWhatsAppApiConfigured`, `sendViaMetaApi` from `@/lib/whatsapp`;
  `calculateRewardCents`, `calculateExpiresAt` from `@/lib/rewards`; `formatDateBR`
  from `@/lib/dates`; `whatsappSends` from `@/db/schema`.
- Produces: no change to the `POST /api/sales` response shape — this task only
  adds a side effect after the sale is created. `GET /api/sales` (same file) gets
  one new field in its existing response shape: every item in the `sales` array
  now also carries `cashbackUsed: boolean`. Task 11's UI (the reward/cashback
  columns and the toggle button on `/recompensas`) depends on this field being
  present — without this step, `s.cashbackUsed` would be `undefined` for every row
  in that table.

- [ ] **Step 1: Write the failing tests**

Add to `app/api/sales/route.test.ts`:

```ts
import { afterEach, /* existing imports */ vi } from 'vitest';
import { whatsappSends } from '@/db/schema';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ... inside describe('/api/sales'), or wherever GET is already tested:

  it('includes cashbackUsed in the listed sales', async () => {
    const customer = await createCustomer();
    await POST(postReq({ customerId: customer.id, saleDate: '2026-09-14', valueCents: 10000 }));
    const res = await GET(getReq()); // reuse this file's existing GET request helper
    const data = await res.json();
    expect(data.sales[0]).toMatchObject({ cashbackUsed: false });
  });

// ... inside describe('/api/sales'), or wherever POST is already tested:

  it('creates the sale even if the WhatsApp send fails, and logs the failure', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));

    const customer = await createCustomer(); // reuse whatever helper already exists in this file
    const res = await POST(postReq({ customerId: customer.id, saleDate: '2026-09-14', valueCents: 10000 }));
    expect(res.status).toBe(201);

    const rows = await db.select().from(whatsappSends);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'purchase', status: 'failed', trigger: 'auto' });
  });

  it('sends the purchase confirmation and logs it as sent when Meta is configured', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    const customer = await createCustomer();
    await POST(postReq({ customerId: customer.id, saleDate: '2026-09-14', valueCents: 10000 }));

    const rows = await db.select().from(whatsappSends);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'purchase', status: 'sent', trigger: 'auto' });
  });

  it('does not attempt or log any WhatsApp send when the API is not configured', async () => {
    const customer = await createCustomer();
    await POST(postReq({ customerId: customer.id, saleDate: '2026-09-14', valueCents: 10000 }));

    const rows = await db.select().from(whatsappSends);
    expect(rows).toHaveLength(0);
  });
```

(Adapt `createCustomer`/`postReq` to the names this file's existing tests already
use.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/api/sales/route.test.ts`
Expected: the 3 new tests FAIL — no WhatsApp logic exists in `POST` yet.

- [ ] **Step 3: Implement**

In `app/api/sales/route.ts`, in the `GET` handler, add `cashbackUsed:
sales.cashbackUsed` to the existing `.select({...})` call (it currently selects
`id, saleDate, valueCents, customerId, customerName` — add the new field to that
same object, nothing else in `GET` changes):

```ts
  const rows = await db
    .select({
      id: sales.id,
      saleDate: sales.saleDate,
      valueCents: sales.valueCents,
      customerId: sales.customerId,
      customerName: customers.name,
      cashbackUsed: sales.cashbackUsed,
    })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(eq(sales.storeId, storeId))
    .orderBy(...orderClauses)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
```

Now add imports for the `POST` handler's new best-effort send:

```ts
import { customers, sales, whatsappSends } from '@/db/schema';
import { calculateExpiresAt, calculateRewardCents } from '@/lib/rewards';
import { formatCentsAsBRL } from '@/lib/currency';
import { formatDateBR } from '@/lib/dates';
import { isWhatsAppApiConfigured, sendViaMetaApi } from '@/lib/whatsapp';
```

(`customers`/`sales` are already imported — just add `whatsappSends` to that
existing line rather than duplicating the import statement.)

In the `POST` handler, change the customer lookup to also select `name` and
`phone` (it currently only selects `id`):

```ts
  const customerRows = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phone })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.storeId, storeId)))
    .limit(1);
  const customer = customerRows[0];
  if (!customer) {
    return NextResponse.json({ error: 'invalid_customer' }, { status: 400 });
  }

  const [row] = await db.insert(sales).values({ storeId, customerId, saleDate, valueCents }).returning();

  if (isWhatsAppApiConfigured()) {
    try {
      const rewardCents = calculateRewardCents(valueCents);
      const expiresAt = calculateExpiresAt(saleDate);
      const result = await sendViaMetaApi(customer.phone, [
        customer.name,
        formatDateBR(saleDate),
        formatCentsAsBRL(rewardCents),
        formatDateBR(expiresAt),
      ]);
      await db.insert(whatsappSends).values({
        storeId,
        saleId: row.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        type: 'purchase',
        status: result.ok ? 'sent' : 'failed',
        trigger: 'auto',
        errorMessage: result.error ?? null,
      });
    } catch {
      // Best-effort: the sale above is already committed. A WhatsApp or
      // logging failure here must never affect the response to the client.
    }
  }

  return NextResponse.json({ sale: row }, { status: 201 });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/api/sales/route.test.ts`
Expected: all PASS, including every pre-existing test (they don't set the Meta env
vars, so `isWhatsAppApiConfigured()` is `false` and the new block is a no-op for
them — same behavior as before).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/api/sales/route.ts app/api/sales/route.test.ts
git commit -m "feat: send the purchase-confirmation WhatsApp message when the Meta API is configured"
```

---

### Task 6: `GET /api/whatsapp/pending` + mark-opened

**Files:**
- Create: `app/api/whatsapp/pending/route.ts`
- Create: `app/api/whatsapp/pending/route.test.ts`
- Create: `app/api/whatsapp/pending/[type]/[saleId]/mark-opened/route.ts`
- Create: `app/api/whatsapp/pending/[type]/[saleId]/mark-opened/route.test.ts`

**Interfaces:**
- Consumes: `calculateRewardCents`, `calculateExpiresAt` from `@/lib/rewards`;
  `buildRewardMessage`, `buildWhatsAppWebUrl` from `@/lib/whatsapp`;
  `formatCentsAsBRL`, `formatDateBR`.
- Produces: `GET /api/whatsapp/pending` → `{ pending: Array<{ saleId: number; type:
  'purchase' | 'reminder'; customerName: string; whatsappUrl: string }> }`. `POST
  /api/whatsapp/pending/:type/:saleId/mark-opened` → `{ ok: true }`, and inserts a
  `whatsapp_sends` row with `status: 'opened'`, `trigger: 'queue'` — which is what
  makes that item disappear from a subsequent `GET /api/whatsapp/pending` call
  (both routes query the exact same "is this pending?" condition). Task 11 (the
  `/recompensas` UI) is the consumer of both.

- [ ] **Step 1: Write the failing tests**

Create `app/api/whatsapp/pending/route.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { customers, sales, whatsappSends } from '@/db/schema';
import { addDaysToIsoDate, todayIso } from '@/lib/dates';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { GET } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

async function createSale(overrides: { saleDate?: string; cashbackUsed?: boolean } = {}) {
  const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '99999-0000' }).returning();
  const [sale] = await db
    .insert(sales)
    .values({
      storeId,
      customerId: customer.id,
      saleDate: overrides.saleDate ?? todayIso(),
      valueCents: 10000,
      cashbackUsed: overrides.cashbackUsed ?? false,
    })
    .returning();
  return sale;
}

function getReq() {
  return unlockedRequest('http://localhost', storeId);
}

describe('GET /api/whatsapp/pending', () => {
  it('returns 401 when the PIN is not unlocked', async () => {
    const res = await GET(storeRequest('http://localhost', storeId));
    expect(res.status).toBe(401);
  });

  it('lists a freshly registered sale as a pending purchase confirmation', async () => {
    const sale = await createSale();
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.pending).toContainEqual(expect.objectContaining({ saleId: sale.id, type: 'purchase' }));
  });

  it('does not list a sale whose purchase confirmation was already sent', async () => {
    const sale = await createSale();
    await db.insert(whatsappSends).values({
      storeId,
      saleId: sale.id,
      customerName: 'Ana',
      customerPhone: '99999-0000',
      type: 'purchase',
      status: 'sent',
      trigger: 'auto',
    });
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.pending.some((p: any) => p.saleId === sale.id && p.type === 'purchase')).toBe(false);
  });

  it('lists a reminder as pending once 25 days have passed and cashback is unused', async () => {
    const sale = await createSale({ saleDate: addDaysToIsoDate(todayIso(), -25) });
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.pending).toContainEqual(expect.objectContaining({ saleId: sale.id, type: 'reminder' }));
  });

  it('does not list a reminder before day 25', async () => {
    const sale = await createSale({ saleDate: addDaysToIsoDate(todayIso(), -10) });
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.pending.some((p: any) => p.saleId === sale.id && p.type === 'reminder')).toBe(false);
  });

  it('does not list a reminder for a sale whose cashback was already used', async () => {
    const sale = await createSale({ saleDate: addDaysToIsoDate(todayIso(), -25), cashbackUsed: true });
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.pending.some((p: any) => p.saleId === sale.id && p.type === 'reminder')).toBe(false);
  });

  it('does not list a reminder for a sale that already expired (30+ days)', async () => {
    const sale = await createSale({ saleDate: addDaysToIsoDate(todayIso(), -31) });
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.pending.some((p: any) => p.saleId === sale.id && p.type === 'reminder')).toBe(false);
  });

  it('each pending item carries a ready-to-open WhatsApp Web URL', async () => {
    await createSale();
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.pending[0].whatsappUrl).toMatch(/^https:\/\/web\.whatsapp\.com\/send\?phone=55/);
  });
});
```

Create `app/api/whatsapp/pending/[type]/[saleId]/mark-opened/route.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { customers, sales, whatsappSends } from '@/db/schema';
import { todayIso } from '@/lib/dates';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { POST } from './route';

let storeId: number;
let saleId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
  const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '99999-0000' }).returning();
  const [sale] = await db
    .insert(sales)
    .values({ storeId, customerId: customer.id, saleDate: todayIso(), valueCents: 10000 })
    .returning();
  saleId = sale.id;
});

function postReq() {
  return unlockedRequest('http://localhost', storeId, { method: 'POST' });
}

describe('POST /api/whatsapp/pending/:type/:saleId/mark-opened', () => {
  it('returns 401 when the PIN is not unlocked', async () => {
    const res = await POST(storeRequest('http://localhost', storeId, { method: 'POST' }), {
      params: { type: 'purchase', saleId: String(saleId) },
    });
    expect(res.status).toBe(401);
  });

  it('logs the item as opened, with trigger=queue', async () => {
    const res = await POST(postReq(), { params: { type: 'purchase', saleId: String(saleId) } });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(whatsappSends);
    expect(row).toMatchObject({ saleId, type: 'purchase', status: 'opened', trigger: 'queue' });
  });

  it('returns 404 for a sale that does not belong to this store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const res = await POST(unlockedRequest('http://localhost', otherStoreId, { method: 'POST' }), {
      params: { type: 'reminder', saleId: String(saleId) },
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid type', async () => {
    const res = await POST(postReq(), { params: { type: 'bogus', saleId: String(saleId) } });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/api/whatsapp/pending`
Expected: FAIL — neither route file exists yet.

- [ ] **Step 3: Implement `app/api/whatsapp/pending/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { and, eq, notExists, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, sales, whatsappSends } from '@/db/schema';
import { calculateExpiresAt, calculateRewardCents } from '@/lib/rewards';
import { formatCentsAsBRL } from '@/lib/currency';
import { formatDateBR } from '@/lib/dates';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';
import { buildRewardMessage, buildWhatsAppWebUrl } from '@/lib/whatsapp';

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
        notExists(
          db
            .select()
            .from(whatsappSends)
            .where(and(eq(whatsappSends.saleId, sales.id), eq(whatsappSends.type, 'purchase'))),
        ),
      ),
    );

  const pendingReminders = await db
    .select(selectColumns)
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(
      and(
        eq(sales.storeId, storeId),
        eq(sales.cashbackUsed, false),
        sql`${sales.saleDate} + interval '25 days' <= current_date`,
        sql`${sales.saleDate} + interval '30 days' > current_date`,
        notExists(
          db
            .select()
            .from(whatsappSends)
            .where(and(eq(whatsappSends.saleId, sales.id), eq(whatsappSends.type, 'reminder'))),
        ),
      ),
    );

  const pending = [
    ...pendingPurchases.map((r) => toItem(r, 'purchase')),
    ...pendingReminders.map((r) => toItem(r, 'reminder')),
  ];

  return NextResponse.json({ pending });
}
```

- [ ] **Step 4: Implement `app/api/whatsapp/pending/[type]/[saleId]/mark-opened/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, sales, whatsappSends } from '@/db/schema';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { type: string; saleId: string } }) {
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }
  const saleId = Number(params.saleId);
  if (!Number.isInteger(saleId) || (params.type !== 'purchase' && params.type !== 'reminder')) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  // `params.type` is still typed as plain `string` here even after the guard
  // above (TypeScript can't narrow a `string` param down to a literal union
  // via an exclusion check) — the guard above proves it's safe, so assert it
  // explicitly rather than fighting the type.
  const type = params.type as 'purchase' | 'reminder';

  const rows = await db
    .select({ id: sales.id, customerName: customers.name, customerPhone: customers.phone })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(and(eq(sales.id, saleId), eq(sales.storeId, storeId)))
    .limit(1);
  const sale = rows[0];
  if (!sale) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  await db.insert(whatsappSends).values({
    storeId,
    saleId: sale.id,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    type,
    status: 'opened',
    trigger: 'queue',
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run app/api/whatsapp/pending`
Expected: all PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add app/api/whatsapp
git commit -m "feat: add the pending-WhatsApp-messages queue (purchase confirmations + due reminders)"
```

---

### Task 7: `POST /api/sales/:id/send-reminder` (manual button)

**Files:**
- Create: `app/api/sales/[id]/send-reminder/route.ts`
- Create: `app/api/sales/[id]/send-reminder/route.test.ts`

**Interfaces:**
- Consumes: same `lib/rewards`/`lib/whatsapp`/`lib/dates`/`lib/currency` helpers as
  Task 6.
- Produces: `POST /api/sales/:id/send-reminder` → `{ whatsappUrl: string }`, logs a
  `whatsapp_sends` row with `type: 'reminder'`, `status: 'opened'`, `trigger:
  'manual'`. Available for any sale at any time (not gated by the 25-day window —
  it's an on-demand override, per spec).

- [ ] **Step 1: Write the failing tests**

Create `app/api/sales/[id]/send-reminder/route.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { customers, sales, whatsappSends } from '@/db/schema';
import { todayIso } from '@/lib/dates';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { POST } from './route';

let storeId: number;
let saleId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
  const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '99999-0000' }).returning();
  const [sale] = await db
    .insert(sales)
    .values({ storeId, customerId: customer.id, saleDate: todayIso(), valueCents: 10000 })
    .returning();
  saleId = sale.id;
});

function postReq() {
  return unlockedRequest('http://localhost', storeId, { method: 'POST' });
}

describe('POST /api/sales/:id/send-reminder', () => {
  it('returns 401 when the PIN is not unlocked', async () => {
    const res = await POST(storeRequest('http://localhost', storeId, { method: 'POST' }), { params: { id: String(saleId) } });
    expect(res.status).toBe(401);
  });

  it('returns a ready-to-open WhatsApp Web URL and logs it as a manual reminder', async () => {
    const res = await POST(postReq(), { params: { id: String(saleId) } });
    expect(res.status).toBe(200);
    const data = await res.json();
    // '99999-0000' strips to the 9 digits '999990000', then gets the '55'
    // country-code prefix from buildWhatsAppWebUrl -> '55999990000'.
    expect(data.whatsappUrl).toContain('https://web.whatsapp.com/send?phone=55999990000&text=');

    const [row] = await db.select().from(whatsappSends);
    expect(row).toMatchObject({ saleId, type: 'reminder', status: 'opened', trigger: 'manual' });
  });

  it('works even when the sale is well within its 30-day window (not gated by day 25)', async () => {
    const res = await POST(postReq(), { params: { id: String(saleId) } }); // saleDate is today, day 0
    expect(res.status).toBe(200);
  });

  it('returns 404 for a sale in a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const res = await POST(unlockedRequest('http://localhost', otherStoreId, { method: 'POST' }), {
      params: { id: String(saleId) },
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-integer id instead of throwing', async () => {
    const res = await POST(postReq(), { params: { id: 'abc' } });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/api/sales/[id]/send-reminder/route.test.ts`
Expected: FAIL — the route doesn't exist yet.

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/api/sales/[id]/send-reminder/route.test.ts`
Expected: all PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/api/sales/[id]/send-reminder
git commit -m "feat: add manual 'send reminder' WhatsApp Web link endpoint"
```

---

### Task 8: `GET /api/rewards/expiring` (report data)

**Files:**
- Create: `app/api/rewards/expiring/route.ts`
- Create: `app/api/rewards/expiring/route.test.ts`

**Interfaces:**
- Consumes: `calculateRewardCents`, `calculateExpiresAt` from `@/lib/rewards`;
  `todayIso`, `addDaysToIsoDate` from `@/lib/dates`.
- Produces: `GET /api/rewards/expiring?from=&to=&cashbackUsed=&page=&pageSize=` →
  `{ items: Array<{ id, saleDate, customerName, valueCents, rewardCents,
  cashbackUsed, expiresAt }>, total, page, pageSize, from, to }`. Default `from` =
  today, default `to` = today+10, default (no `cashbackUsed` param) = both
  included. Sorted by `saleDate DESC`. Task 12 (`/recompensas/relatorio`) is the
  consumer.

- [ ] **Step 1: Write the failing tests**

Create `app/api/rewards/expiring/route.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { customers, sales } from '@/db/schema';
import { addDaysToIsoDate, todayIso } from '@/lib/dates';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { GET } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

async function createSale(daysAgo: number, valueCents = 10000, cashbackUsed = false) {
  const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '99999-0000' }).returning();
  const [sale] = await db
    .insert(sales)
    .values({ storeId, customerId: customer.id, saleDate: addDaysToIsoDate(todayIso(), -daysAgo), valueCents, cashbackUsed })
    .returning();
  return sale;
}

function getReq(query = '') {
  return unlockedRequest(`http://localhost/api/rewards/expiring${query}`, storeId);
}

describe('GET /api/rewards/expiring', () => {
  it('returns 401 when the PIN is not unlocked', async () => {
    const res = await GET(storeRequest('http://localhost', storeId));
    expect(res.status).toBe(401);
  });

  it('includes a sale expiring within the default 10-day window (sold 25 days ago, expires in 5)', async () => {
    const sale = await createSale(25);
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.items.map((i: any) => i.id)).toContain(sale.id);
  });

  it('excludes a sale expiring well outside the default window (sold yesterday, expires in 29 days)', async () => {
    const sale = await createSale(1);
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.items.map((i: any) => i.id)).not.toContain(sale.id);
  });

  it('computes rewardCents as 5% of valueCents and expiresAt as saleDate+30', async () => {
    const sale = await createSale(25, 10000);
    const res = await GET(getReq());
    const data = await res.json();
    const item = data.items.find((i: any) => i.id === sale.id);
    expect(item.rewardCents).toBe(500);
    expect(item.expiresAt).toBe(addDaysToIsoDate(sale.saleDate, 30));
  });

  it('filters by cashbackUsed=false, excluding used sales', async () => {
    const used = await createSale(25, 10000, true);
    const unused = await createSale(25, 10000, false);
    const res = await GET(getReq('?cashbackUsed=false'));
    const data = await res.json();
    const ids = data.items.map((i: any) => i.id);
    expect(ids).toContain(unused.id);
    expect(ids).not.toContain(used.id);
  });

  it('filters by cashbackUsed=true, including only used sales', async () => {
    const used = await createSale(25, 10000, true);
    const unused = await createSale(25, 10000, false);
    const res = await GET(getReq('?cashbackUsed=true'));
    const data = await res.json();
    const ids = data.items.map((i: any) => i.id);
    expect(ids).toContain(used.id);
    expect(ids).not.toContain(unused.id);
  });

  it('respects an explicit from/to expiry-date range', async () => {
    const farOut = await createSale(0); // expires in 30 days
    const res = await GET(getReq(`?from=${addDaysToIsoDate(todayIso(), 29)}&to=${addDaysToIsoDate(todayIso(), 31)}`));
    const data = await res.json();
    expect(data.items.map((i: any) => i.id)).toContain(farOut.id);
  });

  it('paginates and sorts by sale date descending', async () => {
    const older = await createSale(25, 10000);
    await new Promise((r) => setTimeout(r, 5));
    const newer = await createSale(20, 10000);
    const res = await GET(getReq('?pageSize=1&page=1'));
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    expect(data.total).toBe(2);
    expect(data.items[0].id).toBe(newer.id);
  });

  it('only returns sales from the requesting store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const [customer] = await db.insert(customers).values({ storeId: otherStoreId, name: 'Bia', phone: '1' }).returning();
    await db.insert(sales).values({ storeId: otherStoreId, customerId: customer.id, saleDate: addDaysToIsoDate(todayIso(), -25), valueCents: 5000 });
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/api/rewards/expiring/route.test.ts`
Expected: FAIL — the route doesn't exist yet.

- [ ] **Step 3: Implement**

```ts
import { NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, sales } from '@/db/schema';
import { addDaysToIsoDate, todayIso } from '@/lib/dates';
import { calculateExpiresAt, calculateRewardCents } from '@/lib/rewards';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }

  const url = new URL(req.url);
  const today = todayIso();
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const from = fromParam && DATE_PATTERN.test(fromParam) ? fromParam : today;
  const to = toParam && DATE_PATTERN.test(toParam) ? toParam : addDaysToIsoDate(today, 10);
  const cashbackUsedParam = url.searchParams.get('cashbackUsed');
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE),
  );

  const conditions = [
    eq(sales.storeId, storeId),
    sql`${sales.saleDate} + interval '30 days' >= ${from}::date`,
    sql`${sales.saleDate} + interval '30 days' <= ${to}::date`,
  ];
  if (cashbackUsedParam === 'true') conditions.push(eq(sales.cashbackUsed, true));
  if (cashbackUsedParam === 'false') conditions.push(eq(sales.cashbackUsed, false));
  const whereClause = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(whereClause);

  const rows = await db
    .select({
      id: sales.id,
      saleDate: sales.saleDate,
      valueCents: sales.valueCents,
      cashbackUsed: sales.cashbackUsed,
      customerName: customers.name,
    })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(whereClause)
    .orderBy(desc(sales.saleDate), desc(sales.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const items = rows.map((r) => ({
    id: r.id,
    saleDate: r.saleDate,
    customerName: r.customerName,
    valueCents: r.valueCents,
    rewardCents: calculateRewardCents(r.valueCents),
    cashbackUsed: r.cashbackUsed,
    expiresAt: calculateExpiresAt(r.saleDate),
  }));

  return NextResponse.json({ items, total: count, page, pageSize, from, to });
}
```

The route returns raw ISO dates and cent integers only — formatting for display
happens client-side in Task 12, matching `GET /api/sales`'s existing convention.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/api/rewards/expiring/route.test.ts`
Expected: all PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/api/rewards/expiring
git commit -m "feat: add GET /api/rewards/expiring for the expiring-rewards report"
```

---

### Task 9: Cleanup — `POST /api/rewards/cleanup-expired` + `GET /api/rewards/cleanup-log`

**Files:**
- Create: `app/api/rewards/cleanup-expired/route.ts`
- Create: `app/api/rewards/cleanup-expired/route.test.ts`
- Create: `app/api/rewards/cleanup-log/route.ts`
- Create: `app/api/rewards/cleanup-log/route.test.ts`

**Interfaces:**
- Produces: `POST /api/rewards/cleanup-expired` → `{ rowsDeleted: number }`, hard-
  deletes every sale in this store where `saleDate + 30 days < today` (regardless
  of `cashbackUsed`), logs one `cashback_cleanup_log` row. `GET
  /api/rewards/cleanup-log` → `{ log: Array<{ id, ranAt, rowsDeleted }> }`, newest
  first, scoped to this store, no pagination.

- [ ] **Step 1: Write the failing tests**

Create `app/api/rewards/cleanup-expired/route.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { cashbackCleanupLog, customers, sales } from '@/db/schema';
import { addDaysToIsoDate, todayIso } from '@/lib/dates';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { POST } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

async function createSale(daysAgo: number, cashbackUsed = false) {
  const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '1' }).returning();
  const [sale] = await db
    .insert(sales)
    .values({ storeId, customerId: customer.id, saleDate: addDaysToIsoDate(todayIso(), -daysAgo), valueCents: 1000, cashbackUsed })
    .returning();
  return sale;
}

function postReq() {
  return unlockedRequest('http://localhost', storeId, { method: 'POST' });
}

describe('POST /api/rewards/cleanup-expired', () => {
  it('returns 401 when the PIN is not unlocked', async () => {
    const res = await POST(storeRequest('http://localhost', storeId, { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('deletes a sale that expired 30+ days ago, regardless of cashback_used', async () => {
    const expiredUsed = await createSale(31, true);
    const expiredUnused = await createSale(35, false);
    const res = await POST(postReq());
    const data = await res.json();
    expect(data.rowsDeleted).toBe(2);
    const remaining = await db.select().from(sales);
    expect(remaining.map((s) => s.id)).not.toContain(expiredUsed.id);
    expect(remaining.map((s) => s.id)).not.toContain(expiredUnused.id);
  });

  it('leaves a sale that has not expired yet', async () => {
    const notExpired = await createSale(20);
    await POST(postReq());
    const remaining = await db.select().from(sales);
    expect(remaining.map((s) => s.id)).toContain(notExpired.id);
  });

  it('only deletes sales from the requesting store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const [customer] = await db.insert(customers).values({ storeId: otherStoreId, name: 'Bia', phone: '1' }).returning();
    const [otherSale] = await db
      .insert(sales)
      .values({ storeId: otherStoreId, customerId: customer.id, saleDate: addDaysToIsoDate(todayIso(), -40), valueCents: 1000 })
      .returning();
    await POST(postReq());
    const remaining = await db.select().from(sales);
    expect(remaining.map((s) => s.id)).toContain(otherSale.id);
  });

  it('logs a cleanup run with the exact count deleted', async () => {
    await createSale(31);
    await createSale(40);
    await POST(postReq());
    const [log] = await db.select().from(cashbackCleanupLog);
    expect(log.rowsDeleted).toBe(2);
    expect(log.storeId).toBe(storeId);
  });

  it('still logs a run (with rowsDeleted: 0) when nothing was expired', async () => {
    await POST(postReq());
    const [log] = await db.select().from(cashbackCleanupLog);
    expect(log.rowsDeleted).toBe(0);
  });
});
```

Create `app/api/rewards/cleanup-log/route.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { cashbackCleanupLog } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { GET } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

describe('GET /api/rewards/cleanup-log', () => {
  it('returns 401 when the PIN is not unlocked', async () => {
    const res = await GET(storeRequest('http://localhost', storeId));
    expect(res.status).toBe(401);
  });

  it('lists this store\'s cleanup runs, newest first', async () => {
    await db.insert(cashbackCleanupLog).values({ storeId, rowsDeleted: 2 });
    await new Promise((r) => setTimeout(r, 5));
    await db.insert(cashbackCleanupLog).values({ storeId, rowsDeleted: 5 });
    const res = await GET(unlockedRequest('http://localhost', storeId));
    const data = await res.json();
    expect(data.log).toHaveLength(2);
    expect(data.log[0].rowsDeleted).toBe(5);
  });

  it('does not include another store\'s cleanup runs', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await db.insert(cashbackCleanupLog).values({ storeId: otherStoreId, rowsDeleted: 9 });
    const res = await GET(unlockedRequest('http://localhost', storeId));
    const data = await res.json();
    expect(data.log).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/api/rewards/cleanup-expired app/api/rewards/cleanup-log`
Expected: FAIL — neither route exists yet.

- [ ] **Step 3: Implement `app/api/rewards/cleanup-expired/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { cashbackCleanupLog, sales } from '@/db/schema';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }

  const deleted = await db
    .delete(sales)
    .where(and(eq(sales.storeId, storeId), sql`${sales.saleDate} + interval '30 days' <= current_date`))
    .returning({ id: sales.id });

  const rowsDeleted = deleted.length;
  await db.insert(cashbackCleanupLog).values({ storeId, rowsDeleted });

  return NextResponse.json({ rowsDeleted });
}
```

- [ ] **Step 4: Implement `app/api/rewards/cleanup-log/route.ts`**

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run app/api/rewards/cleanup-expired app/api/rewards/cleanup-log`
Expected: all PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add app/api/rewards/cleanup-expired app/api/rewards/cleanup-log
git commit -m "feat: add hard-delete cleanup for expired rewards, with a run log"
```

---

### Task 10: Vercel Cron — `GET /api/cron/reward-reminders`

**Files:**
- Create: `app/api/cron/reward-reminders/route.ts`
- Create: `app/api/cron/reward-reminders/route.test.ts`
- Create: `vercel.json`
- Modify: `.env.example`

**Interfaces:**
- Produces: `GET /api/cron/reward-reminders` — auth via `Authorization: Bearer
  <CRON_SECRET>` header (no store cookie, this is the one route in the app without
  the PIN-gate pattern, by design — see Global Constraints). Returns `{ sent:
  number, checked: number }` when configured, `{ sent: 0, skipped:
  'not_configured' }` when the Meta env vars are absent.

- [ ] **Step 1: Write the failing tests**

Create `app/api/cron/reward-reminders/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/client';
import { customers, sales, whatsappSends } from '@/db/schema';
import { addDaysToIsoDate, todayIso } from '@/lib/dates';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId } from '@/tests/testStores';
import { GET } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
  vi.stubEnv('CRON_SECRET', 'test-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function cronReq(secret = 'test-secret') {
  return new Request('http://localhost/api/cron/reward-reminders', {
    headers: { authorization: `Bearer ${secret}` },
  });
}

async function createDueSale() {
  const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '99999-0000' }).returning();
  const [sale] = await db
    .insert(sales)
    .values({ storeId, customerId: customer.id, saleDate: addDaysToIsoDate(todayIso(), -25), valueCents: 10000 })
    .returning();
  return sale;
}

describe('GET /api/cron/reward-reminders', () => {
  it('returns 401 with a missing or wrong secret', async () => {
    const res = await GET(cronReq('wrong'));
    expect(res.status).toBe(401);
  });

  it('returns skipped:not_configured and sends nothing when the Meta API is not configured', async () => {
    const sale = await createDueSale();
    const res = await GET(cronReq());
    const data = await res.json();
    expect(data.skipped).toBe('not_configured');
    const rows = await db.select().from(whatsappSends);
    expect(rows).toHaveLength(0);
  });

  it('sends the reminder and logs it when configured and a sale is due', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    const sale = await createDueSale();
    const res = await GET(cronReq());
    const data = await res.json();
    expect(data.sent).toBe(1);

    const [row] = await db.select().from(whatsappSends);
    expect(row).toMatchObject({ saleId: sale.id, type: 'reminder', status: 'sent', trigger: 'auto' });
  });

  it('does not resend a reminder that was already logged', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await createDueSale();
    await GET(cronReq());
    await GET(cronReq());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('checks sales across every store, not just one', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    await createDueSale();
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const [otherCustomer] = await db.insert(customers).values({ storeId: otherStoreId, name: 'Bia', phone: '1' }).returning();
    await db.insert(sales).values({ storeId: otherStoreId, customerId: otherCustomer.id, saleDate: addDaysToIsoDate(todayIso(), -25), valueCents: 5000 });

    const res = await GET(cronReq());
    const data = await res.json();
    expect(data.sent).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/api/cron/reward-reminders/route.test.ts`
Expected: FAIL — the route doesn't exist yet.

- [ ] **Step 3: Implement**

```ts
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
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
        sql`not exists (select 1 from whatsapp_sends ws where ws.sale_id = ${sales.id} and ws.type = 'reminder')`,
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
```

- [ ] **Step 4: Create `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron/reward-reminders", "schedule": "0 12 * * *" }
  ]
}
```

- [ ] **Step 5: Update `.env.example`**

Add these four lines (after the existing `SALE_PIN_*` ones):

```
META_WHATSAPP_TOKEN=
META_WHATSAPP_PHONE_NUMBER_ID=
META_WHATSAPP_TEMPLATE_NAME=
CRON_SECRET=
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run app/api/cron/reward-reminders/route.test.ts`
Expected: all PASS.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add app/api/cron/reward-reminders vercel.json .env.example
git commit -m "feat: add the daily Vercel Cron job for automatic reward reminders"
```

---

### Task 11: `/recompensas` UI — reward display, toggle, manual button, pending queue

**Files:**
- Modify: `app/recompensas/page.tsx`
- Modify: `app/recompensas/page.test.tsx`

**Interfaces:**
- Consumes: `calculateRewardCents` from `@/lib/rewards`; `CheckIcon`/`XIcon`/etc.
  already imported from `@/components/ui/icons` (add `SendIcon`-equivalent — reuse
  an existing icon rather than adding a new one, see Step 3 below); `GET
  /api/whatsapp/pending`, `POST /api/whatsapp/pending/:type/:saleId/mark-opened`,
  `POST /api/sales/:id/send-reminder` from Tasks 6-7; `PUT /api/sales/:id` with
  `{ cashbackUsed }` from Task 4.

This task is a substantial rewrite of `RecompensasContent` — read the current file
first (it already has `selectedCustomer`, `saleDate`, `valueCents`, the sales
`Table`, etc. from earlier work this session) and layer the following on top
without disturbing what's already there.

- [ ] **Step 1: Write the failing tests**

Add to `app/recompensas/page.test.tsx` (new `it` blocks; keep every existing test
in the file untouched):

```ts
  it('shows the calculated reward live as the sale value is typed', async () => {
    unlock();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ sales: [], total: 0, pending: [] }) }));
    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Nenhuma venda lançada ainda.')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Valor da venda'), { target: { value: '10000' } });
    expect(screen.getByText('R$ 5,00')).toBeInTheDocument(); // 5% of R$100,00
  });

  it('shows a reward column in the sales table', async () => {
    unlock();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ sales: [{ id: 1, saleDate: '2026-09-14', valueCents: 10000, customerId: 1, customerName: 'Ana', cashbackUsed: false }], total: 1, pending: [] }),
    }));
    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    expect(screen.getByText('R$ 5,00')).toBeInTheDocument();
  });

  it('toggles cashback used for a sale', async () => {
    unlock();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url.startsWith('/api/sales?')) {
        return Promise.resolve({ json: async () => ({ sales: [{ id: 1, saleDate: '2026-09-14', valueCents: 10000, customerId: 1, customerName: 'Ana', cashbackUsed: false }], total: 1 }) });
      }
      if (url === '/api/whatsapp/pending') {
        return Promise.resolve({ json: async () => ({ pending: [] }) });
      }
      if (url === '/api/sales/1' && method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({ sale: { id: 1, cashbackUsed: true } }) });
      }
      return Promise.resolve({ json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como usado' }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(([u, i]: [string, RequestInit?]) => u === '/api/sales/1' && i?.method === 'PUT');
      expect(putCall).toBeDefined();
      expect(JSON.parse((putCall![1] as RequestInit).body as string)).toEqual({ cashbackUsed: true });
    });
  });

  it('shows a pending-messages banner and processes one at a time', async () => {
    unlock();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url.startsWith('/api/sales?')) {
        return Promise.resolve({ json: async () => ({ sales: [], total: 0 }) });
      }
      if (url === '/api/whatsapp/pending') {
        return Promise.resolve({
          json: async () => ({ pending: [{ saleId: 1, type: 'purchase', customerName: 'Ana', whatsappUrl: 'https://web.whatsapp.com/send?phone=1&text=x' }] }),
        });
      }
      if (url === '/api/whatsapp/pending/purchase/1/mark-opened' && method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
      }
      return Promise.resolve({ json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText(/1 mensagem pendente/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Processar próxima' }));

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://web.whatsapp.com/send?phone=1&text=x', '_blank'));
    await waitFor(() => {
      const markCall = fetchMock.mock.calls.find(([u]: [string]) => u === '/api/whatsapp/pending/purchase/1/mark-opened');
      expect(markCall).toBeDefined();
    });
  });

  it('does not show the pending banner when there is nothing pending', async () => {
    unlock();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ sales: [], total: 0, pending: [] }) }));
    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Nenhuma venda lançada ainda.')).toBeInTheDocument());
    expect(screen.queryByText(/mensagem pendente/)).not.toBeInTheDocument();
  });

  it('sends a manual reminder and opens WhatsApp Web', async () => {
    unlock();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url.startsWith('/api/sales?')) {
        return Promise.resolve({ json: async () => ({ sales: [{ id: 1, saleDate: '2026-09-14', valueCents: 10000, customerId: 1, customerName: 'Ana', cashbackUsed: false }], total: 1 }) });
      }
      if (url === '/api/whatsapp/pending') {
        return Promise.resolve({ json: async () => ({ pending: [] }) });
      }
      if (url === '/api/sales/1/send-reminder' && method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ whatsappUrl: 'https://web.whatsapp.com/send?phone=1&text=lembrete' }) });
      }
      return Promise.resolve({ json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Enviar lembrete' }));

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://web.whatsapp.com/send?phone=1&text=lembrete', '_blank'));
  });
```

Also add a link to `lib/rewards` at the top of the test file if any assertion needs
it directly (most don't — they assert on rendered `R$` strings, matching the
existing style of this test file).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/recompensas/page.test.tsx`
Expected: the 6 new tests FAIL; every pre-existing test in the file still PASSES
(you have not touched the component yet).

- [ ] **Step 3: Implement**

Add a `SendIcon` to `components/ui/icons.tsx` (none of the existing icons —
`PlusIcon`, `PencilIcon`, `TrashIcon`, `CheckIcon`, `XIcon` — fit "send a
message"), following the exact same pattern as the others in that file (same
`IconProps` type, same `commonProps` spread):

```tsx
export function SendIcon({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <path d="m3 3 18 9-18 9 4-9-4-9Z" />
    </svg>
  );
}
```

Add imports at the top of `app/recompensas/page.tsx`:

```ts
import { calculateRewardCents } from '@/lib/rewards';
```

Add `SendIcon` to the existing `import { CheckIcon, PencilIcon, PlusIcon,
TrashIcon, XIcon } from '@/components/ui/icons';` line, making it `import {
CheckIcon, PencilIcon, PlusIcon, SendIcon, TrashIcon, XIcon } from
'@/components/ui/icons';`.

Extend the `Sale` interface:

```ts
interface Sale {
  id: number;
  saleDate: string;
  valueCents: number;
  customerId: number;
  customerName: string;
  cashbackUsed: boolean;
}
```

Add new state inside `RecompensasContent`, alongside the existing state:

```ts
  const [pending, setPending] = useState<Array<{ saleId: number; type: 'purchase' | 'reminder'; customerName: string; whatsappUrl: string }>>([]);
  const [processingPending, setProcessingPending] = useState(false);
```

Add a `loadPending` function next to the existing `load`:

```ts
  const loadPending = useCallback(async () => {
    const res = await fetch('/api/whatsapp/pending');
    const data = await res.json();
    setPending(data.pending ?? []);
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);
```

Add a handler to process the next pending item:

```ts
  async function processNextPending() {
    const next = pending[0];
    if (!next) return;
    setProcessingPending(true);
    try {
      window.open(next.whatsappUrl, '_blank');
      await fetch(`/api/whatsapp/pending/${next.type}/${next.saleId}/mark-opened`, { method: 'POST' });
      setPending((current) => current.slice(1));
    } finally {
      setProcessingPending(false);
    }
  }
```

Add a handler for the cashback-used toggle:

```ts
  async function toggleCashbackUsed(sale: Sale) {
    setActionError(null);
    const res = await fetch(`/api/sales/${sale.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cashbackUsed: !sale.cashbackUsed }),
    });
    if (!res.ok) {
      setActionError('Não foi possível atualizar o cashback dessa venda.');
      return;
    }
    load();
  }
```

Add a handler for the manual reminder button:

```ts
  async function sendReminder(sale: Sale) {
    setActionError(null);
    const res = await fetch(`/api/sales/${sale.id}/send-reminder`, { method: 'POST' });
    if (!res.ok) {
      setActionError('Não foi possível preparar o lembrete dessa venda.');
      return;
    }
    const data = await res.json();
    window.open(data.whatsappUrl, '_blank');
  }
```

In the JSX, right after the opening `<PageHeading>`/link row and before the sale
registration `<form>`, add the pending-queue banner (only rendered when there's
something to process — this is what naturally disappears once the Meta API is
configured, since `GET /api/whatsapp/pending` always returns an empty list once
sends happen automatically):

```tsx
      {pending.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning-light bg-warning-light px-4 py-3">
          <span className="text-sm font-semibold text-ink">
            {pending.length} {pending.length === 1 ? 'mensagem pendente' : 'mensagens pendentes'}
          </span>
          <Button type="button" size="sm" disabled={processingPending} onClick={processNextPending}>
            {processingPending ? 'Abrindo...' : 'Processar próxima'}
          </Button>
        </div>
      )}
```

Add the live reward preview right after the `CurrencyInput` in the registration
form:

```tsx
          {valueCents > 0 && (
            <span className="text-sm text-gray-600">
              Recompensa: <span className="font-semibold text-accent">{formatCentsAsBRL(calculateRewardCents(valueCents))}</span>
            </span>
          )}
```

In the `Table` `columns` array, add a "Recompensa" column right after "Valor", and
a "Cashback" column right after that (before "Ações"):

```tsx
          {
            header: 'Recompensa',
            render: (s: Sale) => formatCentsAsBRL(calculateRewardCents(s.valueCents)),
          },
          {
            header: 'Cashback',
            render: (s: Sale) =>
              <Button
                type="button"
                size="sm"
                variant={s.cashbackUsed ? 'secondary' : 'primary'}
                icon={s.cashbackUsed ? <XIcon /> : <CheckIcon />}
                onClick={() => toggleCashbackUsed(s)}
              >
                {s.cashbackUsed ? 'Desmarcar' : 'Marcar como usado'}
              </Button>,
          },
```

In the "Ações" column's non-editing branch, add the "Enviar lembrete" button
alongside the existing Editar/Remover:

```tsx
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="secondary" icon={<PencilIcon />} onClick={() => startEdit(s)}>
                    Editar
                  </Button>
                  <Button type="button" size="sm" variant="secondary" icon={<SendIcon />} onClick={() => sendReminder(s)}>
                    Enviar lembrete
                  </Button>
                  <Button type="button" size="sm" variant="danger" icon={<TrashIcon />} onClick={() => removeSale(s.id)}>
                    Remover
                  </Button>
                </div>
```

Finally, add a link to the new report page next to the existing "Gerenciar
clientes" link:

```tsx
        <div className="mb-6 flex items-center justify-between">
          <PageHeading>Recompensas</PageHeading>
          <div className="flex gap-4">
            <Link href="/recompensas/relatorio" className="text-sm font-semibold text-accent hover:underline">
              Relatório de vencimentos
            </Link>
            <Link href="/recompensas/clientes" className="text-sm font-semibold text-accent hover:underline">
              Gerenciar clientes
            </Link>
          </div>
        </div>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/recompensas/page.test.tsx`
Expected: all PASS, including every pre-existing test in the file.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/recompensas/page.tsx app/recompensas/page.test.tsx components/ui/icons.tsx
git commit -m "feat: show live reward, cashback toggle, manual reminder, and the pending-WhatsApp queue on /recompensas"
```

---

### Task 12: `/recompensas/relatorio` — expiring-rewards report + cleanup

**Files:**
- Create: `app/recompensas/relatorio/page.tsx`
- Create: `app/recompensas/relatorio/page.test.tsx`

**Interfaces:**
- Consumes: `GET /api/rewards/expiring` (Task 8), `POST
  /api/rewards/cleanup-expired` + `GET /api/rewards/cleanup-log` (Task 9); reuses
  `PinGate`, `Table`, `Pagination`, `PageHeading`, `Button`, icons, `formatCentsAsBRL`,
  `formatDateBR` exactly like `/recompensas` and `/recompensas/clientes` already
  do.

- [ ] **Step 1: Write the failing tests**

Create `app/recompensas/relatorio/page.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RelatorioPage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'store_id=; path=/; max-age=0';
  document.cookie = 'sale_pin_ok=; path=/; max-age=0';
});

function unlock() {
  document.cookie = 'store_id=1; path=/';
  document.cookie = 'sale_pin_ok=1; path=/';
}

describe('RelatorioPage', () => {
  it('shows the PIN form when not unlocked, without ever calling fetch', async () => {
    document.cookie = 'store_id=1; path=/';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<RelatorioPage />);
    await waitFor(() => expect(screen.getByPlaceholderText('PIN')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists the expiring rewards, formatted', async () => {
    unlock();
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith('/api/rewards/expiring')) {
        return Promise.resolve({
          json: async () => ({
            items: [{ id: 1, saleDate: '2026-09-14', customerName: 'Ana', valueCents: 10000, rewardCents: 500, cashbackUsed: false, expiresAt: '2026-10-14' }],
            total: 1,
          }),
        });
      }
      if (url === '/api/rewards/cleanup-log') {
        return Promise.resolve({ json: async () => ({ log: [] }) });
      }
      return Promise.resolve({ json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RelatorioPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    expect(screen.getByText('R$ 100,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 5,00')).toBeInTheDocument();
    expect(screen.getByText('14/09/2026')).toBeInTheDocument();
    expect(screen.getByText('14/10/2026')).toBeInTheDocument();
  });

  it('re-fetches with cashbackUsed=true when that filter is selected', async () => {
    unlock();
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ items: [], total: 0, log: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<RelatorioPage />);
    await waitFor(() => expect(screen.getByText('Nenhuma recompensa a vencer nesse período.')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Cashback já utilizado?'), { target: { value: 'true' } });

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.filter(([u]: [string]) => u.startsWith('/api/rewards/expiring')).pop();
      const params = new URL(lastCall[0], 'http://localhost').searchParams;
      expect(params.get('cashbackUsed')).toBe('true');
    });
  });

  it('runs the cleanup after confirming, and reloads the list and the log', async () => {
    unlock();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url === '/api/rewards/cleanup-expired' && method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ rowsDeleted: 3 }) });
      }
      return Promise.resolve({ json: async () => ({ items: [], total: 0, log: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RelatorioPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /limpar vendas/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /limpar vendas/i }));

    await waitFor(() => {
      const cleanupCall = fetchMock.mock.calls.find(([u, i]: [string, RequestInit?]) => u === '/api/rewards/cleanup-expired' && i?.method === 'POST');
      expect(cleanupCall).toBeDefined();
    });
  });

  it('does not run the cleanup if the confirmation is declined', async () => {
    unlock();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ items: [], total: 0, log: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<RelatorioPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /limpar vendas/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /limpar vendas/i }));

    await waitFor(() => {
      const cleanupCall = fetchMock.mock.calls.find(([u, i]: [string, RequestInit?]) => u === '/api/rewards/cleanup-expired' && i?.method === 'POST');
      expect(cleanupCall).toBeUndefined();
    });
  });

  it('shows the cleanup history', async () => {
    unlock();
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/rewards/cleanup-log') {
        return Promise.resolve({ json: async () => ({ log: [{ id: 1, ranAt: '2026-09-01T12:00:00.000Z', rowsDeleted: 4 }] }) });
      }
      return Promise.resolve({ json: async () => ({ items: [], total: 0 }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RelatorioPage />);
    await waitFor(() => expect(screen.getByText(/4/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/recompensas/relatorio/page.test.tsx`
Expected: FAIL — the page doesn't exist yet.

- [ ] **Step 3: Implement**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { PageHeading } from '@/components/ui/PageHeading';
import { Pagination } from '@/components/ui/Pagination';
import { Table } from '@/components/ui/Table';
import { TrashIcon } from '@/components/ui/icons';
import { PinGate } from '@/components/PinGate';
import { formatCentsAsBRL } from '@/lib/currency';
import { formatDateBR, addDaysToIsoDate, todayIso } from '@/lib/dates';

interface ExpiringItem {
  id: number;
  saleDate: string;
  customerName: string;
  valueCents: number;
  rewardCents: number;
  cashbackUsed: boolean;
  expiresAt: string;
}

interface CleanupLogEntry {
  id: number;
  ranAt: string;
  rowsDeleted: number;
}

const PAGE_SIZE = 20;

export default function RelatorioPage() {
  return (
    <PinGate>
      <RelatorioContent />
    </PinGate>
  );
}

function RelatorioContent() {
  const [items, setItems] = useState<ExpiringItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [cashbackUsed, setCashbackUsed] = useState<'false' | 'true' | 'all'>('false');
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(addDaysToIsoDate(todayIso(), 10));
  const [cleanupLog, setCleanupLog] = useState<CleanupLogEntry[]>([]);
  const [cleaning, setCleaning] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), from, to });
    if (cashbackUsed !== 'all') params.set('cashbackUsed', cashbackUsed);
    const res = await fetch(`/api/rewards/expiring?${params.toString()}`);
    const data = await res.json();
    setItems(data.items ?? []);
    setTotal(data.total ?? 0);
  }, [page, from, to, cashbackUsed]);

  const loadCleanupLog = useCallback(async () => {
    const res = await fetch('/api/rewards/cleanup-log');
    const data = await res.json();
    setCleanupLog(data.log ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadCleanupLog();
  }, [loadCleanupLog]);

  async function runCleanup() {
    if (!window.confirm('Isso vai apagar permanentemente todas as vendas com cashback já vencido (mais de 30 dias). Essa ação não pode ser desfeita. Confirmar?')) {
      return;
    }
    setCleaning(true);
    try {
      const res = await fetch('/api/rewards/cleanup-expired', { method: 'POST' });
      if (res.ok) {
        load();
        loadCleanupLog();
      }
    } finally {
      setCleaning(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <PageHeading>Relatório de recompensas a vencer</PageHeading>
        <Link href="/recompensas" className="text-sm font-semibold text-accent hover:underline">
          Voltar pra Recompensas
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm text-gray-600">
          Vencimento de
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-600">
          Vencimento até
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-600" htmlFor="cashbackUsedFilter">
          Cashback já utilizado?
          <select
            id="cashbackUsedFilter"
            value={cashbackUsed}
            onChange={(e) => {
              setCashbackUsed(e.target.value as 'false' | 'true' | 'all');
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            <option value="false">Não</option>
            <option value="true">Sim</option>
            <option value="all">Todos</option>
          </select>
        </label>
      </div>

      <Table
        columns={[
          { header: 'Data da compra', render: (i: ExpiringItem) => formatDateBR(i.saleDate) },
          { header: 'Cliente', render: (i: ExpiringItem) => i.customerName },
          { header: 'Valor', render: (i: ExpiringItem) => formatCentsAsBRL(i.valueCents) },
          { header: 'Recompensa', render: (i: ExpiringItem) => formatCentsAsBRL(i.rewardCents) },
          { header: 'Vence em', render: (i: ExpiringItem) => formatDateBR(i.expiresAt) },
          { header: 'Cashback usado', render: (i: ExpiringItem) => (i.cashbackUsed ? 'Sim' : 'Não') },
        ]}
        rows={items}
        emptyMessage="Nenhuma recompensa a vencer nesse período."
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      <div className="mt-10 rounded-2xl border border-gray-200 p-5">
        <h2 className="mb-2 text-xl font-bold">Limpeza de vendas expiradas</h2>
        <p className="mb-4 text-sm text-gray-600">
          Remove permanentemente as vendas cujo cashback já venceu (mais de 30 dias), para não deixar o banco de
          dados grande demais.
        </p>
        <Button type="button" variant="danger" size="sm" icon={<TrashIcon />} disabled={cleaning} onClick={runCleanup}>
          {cleaning ? 'Limpando...' : 'Limpar vendas com cashback expirado'}
        </Button>

        {cleanupLog.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1 text-sm text-gray-600">
            {cleanupLog.map((entry) => (
              <li key={entry.id}>
                {new Date(entry.ranAt).toLocaleString('pt-BR')} — {entry.rowsDeleted} venda(s) removida(s)
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/recompensas/relatorio/page.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/recompensas/relatorio
git commit -m "feat: add the expiring-rewards report page with filters and cleanup"
```

---

### Task 13: Full suite, README, final manual verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: every test file green, 0 unhandled rejections.

- [ ] **Step 2: Run `npx tsc --noEmit` and `npm run build`**

Expected: no new type errors beyond the one pre-existing, already-deferred TS2769
pattern in `app/recompensas/clientes/page.test.tsx` (unrelated to this plan);
`npm run build` completes successfully.

- [ ] **Step 3: Update `README.md`**

Extend the existing "Programa de recompensa: clientes e vendas" section (do not
remove anything already there) with a new paragraph:

```markdown
A recompensa (5% do valor, válida por 30 dias) é calculada na hora, nunca
guardada — veja `lib/rewards.ts`. O aviso ao cliente por WhatsApp funciona em
dois modos, trocados automaticamente pela presença das variáveis de ambiente
`META_WHATSAPP_TOKEN`/`META_WHATSAPP_PHONE_NUMBER_ID`/`META_WHATSAPP_TEMPLATE_NAME`:
sem elas, `/recompensas` mostra uma fila de mensagens pendentes que abrem o
WhatsApp Web (`web.whatsapp.com`) já preenchido, usando a sessão logada do
navegador — cada uma precisa de um clique manual em "Enviar" dentro do
WhatsApp Web, já que nenhum site consegue controlar outro por questão de
segurança do navegador. Com as variáveis configuradas, o aviso de compra sai
na hora e o lembrete roda sozinho todo dia via Vercel Cron
(`vercel.json`, protegido por `CRON_SECRET`) — mas a Meta exige que esse texto
seja pré-cadastrado e aprovado como "template" antes, o que só o dono da conta
consegue fazer. O relatório de recompensas a vencer e a limpeza de vendas já
expiradas (o plano gratuito da Neon tem limite de tamanho) ficam em
`/recompensas/relatorio`.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document the cashback calculation, WhatsApp dual-mode, and expiring-rewards report"
```

## After all tasks: manual verification (controller, not a subagent)

This plan's WhatsApp Web queue (Task 11) is the one piece whose real behavior
(opening a new tab pre-filled correctly, the banner disappearing after
processing) can't be fully confirmed by RTL alone — jsdom doesn't really open
browser tabs. Per this session's established practice, the controller opens the
running app in a real browser after all tasks land and checks, at minimum:

- Register a sale on `/recompensas` with no Meta env vars set locally → confirm a
  "1 mensagem pendente" banner appears, clicking "Processar próxima" opens a real
  new tab pointed at `web.whatsapp.com` with the phone and message pre-filled, and
  the banner disappears afterward.
- The "Enviar lembrete" button on an existing sale opens WhatsApp Web with the
  correct customer/message, independent of the sale's age.
- Toggling "Marcar como usado"/"Desmarcar" updates the row without a page reload.
- `/recompensas/relatorio` loads, the date-range and cashback-used filters
  actually change the results, and the cleanup button's `window.confirm` blocks
  the delete until confirmed.

No code changes are expected from this check unless it surfaces a real defect the
diff-level review couldn't catch.
