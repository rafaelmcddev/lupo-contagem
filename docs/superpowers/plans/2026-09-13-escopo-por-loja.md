# Escopo por loja — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o lupo-contagem operar em duas lojas (Coxim-MS e Campo Grande-MS) — uma tela de seleção de loja na entrada do sistema, e Contagens/Produtos/Grupos passando a ser filtrados por loja, com o histórico atual migrado para Coxim-MS.

**Architecture:** Cookie `store_id` (numérico) gravado no navegador ao escolher a loja em `/loja`; `middleware.ts` garante que o cookie exista antes de qualquer outra rota carregar; as rotas de API leem o cookie (via `lib/store.ts`) para filtrar e gravar dados em `countings`, `skus` e `groups`, as três tabelas que ganham uma coluna `store_id`. `Configurações` continua global.

**Tech Stack:** Next.js 14 (App Router), Drizzle ORM + Postgres, Vitest (testes de integração reais contra Postgres, sem mocks de banco).

**Spec:** `docs/superpowers/specs/2026-09-13-escopo-por-loja-design.md`

## Global Constraints

- Toda rota em `app/api/**/route.ts`, nova ou existente, **precisa** exportar `export const dynamic = 'force-dynamic';` (verificado automaticamente por `app/api/dynamicConfig.test.ts`).
- Todo formulário de criação usa o padrão `creatingRef` além do `useState` de loading (ver README) — não se aplica a este plano, que não adiciona formulário de criação novo além da seleção de loja (que não é um formulário de criação de registro).
- Nenhuma rota de recurso por id (`/api/countings/:id`, `/api/countings/:id/scan`, `/api/countings/:id/finish`, `/api/products/:barcode`, `/api/groups/:id`) pode expor ou alterar um recurso que pertence a uma loja diferente da do cookie atual — deve responder como se o recurso não existisse (404 / `*_not_found`).
- Testes são de integração reais contra o Postgres local de teste (`docker compose up -d`), rodados sequencialmente (`fileParallelism: false`). Cada teste começa com `resetDb()`, que faz `TRUNCATE ... CASCADE` em `scans, boxes, countings, groups, settings, skus` — a tabela `stores` **não** é truncada (é seed/referência), então as duas lojas semeadas pela migração sobrevivem entre testes.

---

## Nota sobre "suite verde" durante este plano

Mudar `db/schema.ts` para exigir `store_id` em `countings`, `skus` e `groups` (Task 1) quebra a compilação/execução de praticamente todo o resto da suite de testes existente (qualquer teste que hoje insere nessas tabelas sem `store_id`), porque é uma mudança estrutural que atravessa o app inteiro. Não é possível manter 100% da suite verde tarefa a tarefa sem duplicar trabalho. Por isso:

- Cada tarefa deste plano diz exatamente **qual arquivo de teste rodar** para validar aquela tarefa isoladamente (ex: `npx vitest run db/schema.test.ts`).
- Só a **última tarefa** (Task 12) roda `npm test` (a suite inteira) como critério final de conclusão.

---

### Task 1: Schema, migração e seed das lojas

**Files:**
- Modify: `db/schema.ts`
- Create: `db/migrations/0004_<nome-gerado>.sql` (nome exato definido pelo `drizzle-kit generate`, ver Step 3)
- Create: `db/migrations/meta/0004_snapshot.json` (gerado automaticamente, não editar)
- Modify: `db/migrations/meta/_journal.json` (gerado automaticamente, não editar)
- Create: `tests/testStores.ts`
- Modify: `db/schema.test.ts`

**Interfaces:**
- Produces: `stores` table (`id`, `name`, `slug`) exportada de `db/schema.ts`; `countings.storeId`, `groups.storeId`, `skus.storeId` (todas `integer` `notNull`, FK para `stores.id`); `skus.id` (novo, `serial primaryKey`, substitui `barcode` como PK); unique composto `groups_store_id_prefix_unique` em `(storeId, prefix)`; unique composto `skus_store_id_barcode_unique` em `(storeId, barcode)`.
- Produces: `tests/testStores.ts` exporta `getTestStoreId(slug?: 'coxim-ms' | 'campo-grande-ms'): Promise<number>` e `storeRequest(url: string, storeId: number, init?: RequestInit): Request` — usados por praticamente todo teste de rota a partir daqui.

- [ ] **Step 1: Editar `db/schema.ts`**

Substitua o arquivo inteiro por:

```ts
import { boolean, integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const countingStatus = pgEnum('counting_status', ['active', 'finished']);
export const countingSource = pgEnum('counting_source', ['manual', 'xml']);

export const stores = pgTable('stores', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
});

export const countings = pgTable('countings', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').notNull().references(() => stores.id),
  name: text('name').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  prefixLengthUsed: integer('prefix_length_used').notNull(),
  requireSkuUsed: boolean('require_sku_used').notNull().default(true),
  status: countingStatus('status').notNull().default('active'),
  source: countingSource('source').notNull().default('manual'),
  invoiceNumber: text('invoice_number'),
  supplierName: text('supplier_name'),
});

export const boxes = pgTable(
  'boxes',
  {
    id: serial('id').primaryKey(),
    countingId: integer('counting_id').notNull().references(() => countings.id),
    boxNumber: integer('box_number').notNull(),
    prefix: text('prefix').notNull(),
  },
  (table) => ({
    prefixUnique: uniqueIndex('boxes_counting_id_prefix_unique').on(table.countingId, table.prefix),
    boxNumberUnique: uniqueIndex('boxes_counting_id_box_number_unique').on(table.countingId, table.boxNumber),
  }),
);

export const scans = pgTable('scans', {
  id: serial('id').primaryKey(),
  boxId: integer('box_id').notNull().references(() => boxes.id),
  barcode: text('barcode').notNull(),
  scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const groups = pgTable(
  'groups',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id').notNull().references(() => stores.id),
    prefix: text('prefix').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    prefixUnique: uniqueIndex('groups_store_id_prefix_unique').on(table.storeId, table.prefix),
  }),
);

export const skus = pgTable(
  'skus',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id').notNull().references(() => stores.id),
    barcode: text('barcode').notNull(),
    // Nullable: whether a SKU is required depends on the "Exigir SKU" setting,
    // enforced in the API routes — not a hard DB constraint, since that
    // setting can be toggled at any time and shouldn't invalidate existing rows.
    sku: text('sku'),
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    barcodeUnique: uniqueIndex('skus_store_id_barcode_unique').on(table.storeId, table.barcode),
  }),
);

export const invoiceItems = pgTable('invoice_items', {
  id: serial('id').primaryKey(),
  countingId: integer('counting_id').notNull().references(() => countings.id),
  barcode: text('barcode').notNull(),
  sku: text('sku'),
  name: text('name'),
  expectedQty: integer('expected_qty').notNull(),
});
```

- [ ] **Step 2: Gerar o esqueleto da migração**

Run: `npm run db:generate`

Isso cria um novo arquivo `db/migrations/0004_<nome-aleatório>.sql`, atualiza `db/migrations/meta/_journal.json` e cria `db/migrations/meta/0004_snapshot.json`. **Não edite o `_journal.json` nem o `_snapshot.json` manualmente** — eles já vão refletir corretamente o `schema.ts` final. Você só vai substituir o conteúdo do `.sql`.

- [ ] **Step 3: Substituir o conteúdo do `.sql` gerado**

Abra o único arquivo novo `db/migrations/0004_*.sql` e substitua **todo o conteúdo** por este SQL (ele faz o mesmo resultado final que o `schema.ts`, mas com um caminho seguro pra dado já existente: coluna nova nullable → backfill → `NOT NULL`, em vez de um `ADD COLUMN ... NOT NULL` direto que quebraria com linhas já existentes):

```sql
CREATE TABLE IF NOT EXISTS "stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "stores_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
INSERT INTO "stores" ("name", "slug") VALUES ('Coxim-MS', 'coxim-ms'), ('Campo Grande-MS', 'campo-grande-ms');
--> statement-breakpoint
ALTER TABLE "countings" ADD COLUMN "store_id" integer;
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "store_id" integer;
--> statement-breakpoint
ALTER TABLE "skus" ADD COLUMN "store_id" integer;
--> statement-breakpoint
UPDATE "countings" SET "store_id" = (SELECT "id" FROM "stores" WHERE "slug" = 'coxim-ms');
--> statement-breakpoint
UPDATE "groups" SET "store_id" = (SELECT "id" FROM "stores" WHERE "slug" = 'coxim-ms');
--> statement-breakpoint
UPDATE "skus" SET "store_id" = (SELECT "id" FROM "stores" WHERE "slug" = 'coxim-ms');
--> statement-breakpoint
ALTER TABLE "countings" ALTER COLUMN "store_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "store_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "skus" ALTER COLUMN "store_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "countings" ADD CONSTRAINT "countings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "groups" ADD CONSTRAINT "groups_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skus" ADD CONSTRAINT "skus_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "groups" DROP CONSTRAINT IF EXISTS "groups_prefix_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "groups_store_id_prefix_unique" ON "groups" USING btree ("store_id","prefix");
--> statement-breakpoint
ALTER TABLE "skus" DROP CONSTRAINT "skus_pkey";
--> statement-breakpoint
ALTER TABLE "skus" ADD COLUMN "id" serial;
--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_pkey" PRIMARY KEY ("id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "skus_store_id_barcode_unique" ON "skus" USING btree ("store_id","barcode");
```

- [ ] **Step 4: Aplicar a migração no banco de teste e checar visualmente**

Run: `npm run db:migrate`

Isso aplica contra o `DATABASE_URL` do `.env` local (o Postgres do `docker compose up -d`). Se sua `.env` local aponta pro banco de dev (não o de teste), tudo bem — o de teste roda a migração sozinho via `globalSetup` quando os testes rodarem no próximo step. O importante aqui é confirmar que a migração **aplica sem erro**.

Expected: `Migrations applied` impresso no console, sem erro.

- [ ] **Step 5: Criar `tests/testStores.ts`**

```ts
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { stores } from '@/db/schema';

export type StoreSlug = 'coxim-ms' | 'campo-grande-ms';

export async function getTestStoreId(slug: StoreSlug = 'coxim-ms'): Promise<number> {
  const [store] = await db.select().from(stores).where(eq(stores.slug, slug)).limit(1);
  if (!store) {
    throw new Error(`Loja de teste "${slug}" não encontrada — confira se a migração de seed rodou (db/migrations).`);
  }
  return store.id;
}

export function storeRequest(url: string, storeId: number, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  const existing = headers.get('cookie');
  headers.set('cookie', existing ? `${existing}; store_id=${storeId}` : `store_id=${storeId}`);
  return new Request(url, { ...init, headers });
}
```

- [ ] **Step 6: Reescrever `db/schema.test.ts`**

Substitua o arquivo inteiro por:

```ts
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './client';
import { boxes, countings, groups, scans, settings, skus, stores } from './schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId } from '@/tests/testStores';

describe('schema', () => {
  let storeId: number;

  beforeEach(async () => {
    await resetDb();
    storeId = await getTestStoreId();
  });

  it('seeds the two known stores and enforces a unique slug', async () => {
    const rows = await db.select().from(stores);
    expect(rows.map((s) => s.slug).sort()).toEqual(['campo-grande-ms', 'coxim-ms']);
    await expect(db.insert(stores).values({ name: 'Outra', slug: 'coxim-ms' })).rejects.toThrow();
  });

  it('can insert a counting, a box and a scan, and enforces the unique prefix per counting', async () => {
    const [counting] = await db
      .insert(countings)
      .values({ storeId, name: 'Teste', prefixLengthUsed: 7, status: 'active' })
      .returning();

    const [box] = await db
      .insert(boxes)
      .values({ countingId: counting.id, boxNumber: 1, prefix: '7891234' })
      .returning();

    await db.insert(scans).values({ boxId: box.id, barcode: '7891234000011' });

    const found = await db.select().from(countings).where(eq(countings.id, counting.id));
    expect(found[0].name).toBe('Teste');
    expect(found[0].requireSkuUsed).toBe(true);

    await expect(
      db.insert(boxes).values({ countingId: counting.id, boxNumber: 2, prefix: '7891234' }),
    ).rejects.toThrow();
  });

  it('can create a counting with requireSkuUsed explicitly false', async () => {
    const [counting] = await db
      .insert(countings)
      .values({ storeId, name: 'Teste', prefixLengthUsed: 7, requireSkuUsed: false, status: 'active' })
      .returning();
    expect(counting.requireSkuUsed).toBe(false);
  });

  it('enforces a unique prefix on groups per store, but allows the same prefix in a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await db.insert(groups).values({ storeId, prefix: '789123', name: 'Cueca Slip Preta' });
    await expect(
      db.insert(groups).values({ storeId, prefix: '789123', name: 'Outro nome' }),
    ).rejects.toThrow();
    await expect(
      db.insert(groups).values({ storeId: otherStoreId, prefix: '789123', name: 'Mesmo prefixo, outra loja' }),
    ).resolves.toBeDefined();
  });

  it('can upsert a setting by key', async () => {
    await db.insert(settings).values({ key: 'prefix_length', value: '7' });
    await db
      .insert(settings)
      .values({ key: 'prefix_length', value: '8' })
      .onConflictDoUpdate({ target: settings.key, set: { value: '8' } });
    const row = await db.select().from(settings).where(eq(settings.key, 'prefix_length'));
    expect(row[0].value).toBe('8');
  });

  it('links an exact barcode to a SKU per store, with an optional name', async () => {
    await db.insert(skus).values({ storeId, barcode: '7891234000011', sku: 'CUECA-SLIP-P' });
    const row = await db.select().from(skus).where(eq(skus.barcode, '7891234000011'));
    expect(row[0].sku).toBe('CUECA-SLIP-P');
    expect(row[0].name).toBeNull();

    await expect(
      db.insert(skus).values({ storeId, barcode: '7891234000011', sku: 'OUTRO-SKU' }),
    ).rejects.toThrow();
  });

  it('allows the same barcode to exist independently in two different stores', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await db.insert(skus).values({ storeId, barcode: '7891234000011', sku: 'LOJA-COXIM' });
    await expect(
      db.insert(skus).values({ storeId: otherStoreId, barcode: '7891234000011', sku: 'LOJA-CG' }),
    ).resolves.toBeDefined();
  });

  it('accepts a name when linking a SKU', async () => {
    await db.insert(skus).values({ storeId, barcode: '7891234999999', sku: 'CUECA-SLIP-M', name: 'Cueca Slip Preta M' });
    const row = await db.select().from(skus).where(eq(skus.barcode, '7891234999999'));
    expect(row[0].name).toBe('Cueca Slip Preta M');
  });
});
```

- [ ] **Step 7: Rodar os testes deste arquivo**

Run: `npx vitest run db/schema.test.ts`
Expected: PASS (todos os `it`s deste arquivo). Ignore falhas em outros arquivos de teste por enquanto — eles são corrigidos nas próximas tarefas.

- [ ] **Step 8: Commit**

```bash
git add db/schema.ts db/schema.test.ts db/migrations tests/testStores.ts
git commit -m "feat: add stores table and scope countings/skus/groups by store"
```

---

### Task 2: `lib/store.ts` — ler a loja do cookie

**Files:**
- Create: `lib/store.ts`
- Create: `lib/store.test.ts`

**Interfaces:**
- Produces: `getStoreIdFromRequest(req: Request): number`, `StoreNotSelectedError` (classe de erro), `STORE_COOKIE_NAME` (constante `'store_id'`).
- Consumes: nada (lê apenas o header `Cookie` do `Request` recebido).

- [ ] **Step 1: Escrever o teste**

Create `lib/store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { StoreNotSelectedError, getStoreIdFromRequest } from './store';

function reqWithCookie(cookie: string | null) {
  const headers = new Headers();
  if (cookie !== null) headers.set('cookie', cookie);
  return new Request('http://localhost', { headers });
}

describe('getStoreIdFromRequest', () => {
  it('reads the store_id cookie', () => {
    expect(getStoreIdFromRequest(reqWithCookie('store_id=2'))).toBe(2);
  });

  it('finds store_id among other cookies', () => {
    expect(getStoreIdFromRequest(reqWithCookie('foo=bar; store_id=5; other=1'))).toBe(5);
  });

  it('throws StoreNotSelectedError when there is no cookie header at all', () => {
    expect(() => getStoreIdFromRequest(reqWithCookie(null))).toThrow(StoreNotSelectedError);
  });

  it('throws StoreNotSelectedError when store_id is missing among other cookies', () => {
    expect(() => getStoreIdFromRequest(reqWithCookie('foo=bar'))).toThrow(StoreNotSelectedError);
  });

  it('throws StoreNotSelectedError when store_id is not a number', () => {
    expect(() => getStoreIdFromRequest(reqWithCookie('store_id=abc'))).toThrow(StoreNotSelectedError);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/store.test.ts`
Expected: FAIL — `Cannot find module './store'` (ainda não existe).

- [ ] **Step 3: Implementar `lib/store.ts`**

```ts
export const STORE_COOKIE_NAME = 'store_id';

export class StoreNotSelectedError extends Error {}

export function getStoreIdFromRequest(req: Request): number {
  const cookieHeader = req.headers.get('cookie') ?? '';
  for (const part of cookieHeader.split(';')) {
    const [key, value] = part.trim().split('=');
    if (key === STORE_COOKIE_NAME) {
      const id = Number(value);
      if (Number.isInteger(id)) return id;
      break;
    }
  }
  throw new StoreNotSelectedError();
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/store.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/store.ts lib/store.test.ts
git commit -m "feat: add getStoreIdFromRequest to read the active store cookie"
```

---

### Task 3: `GET /api/stores`

**Files:**
- Create: `app/api/stores/route.ts`
- Create: `app/api/stores/route.test.ts`

**Interfaces:**
- Consumes: `stores` de `db/schema.ts`.
- Produces: `GET` retornando `{ stores: { id: number; name: string; slug: string }[] }`, ordenado por `name`.

- [ ] **Step 1: Escrever o teste**

Create `app/api/stores/route.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('/api/stores', () => {
  it('lists the seeded stores ordered by name', async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.stores.map((s: { name: string }) => s.name)).toEqual(['Campo Grande-MS', 'Coxim-MS']);
    expect(data.stores[0]).toHaveProperty('id');
    expect(data.stores[0]).toHaveProperty('slug');
  });
});
```

Note: este teste não chama `resetDb()` de propósito — `stores` nunca é truncada, então as duas linhas semeadas pela migração (Task 1) já estão lá desde o `globalSetup`.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run app/api/stores/route.test.ts`
Expected: FAIL — módulo `./route` não existe.

- [ ] **Step 3: Implementar a rota**

Create `app/api/stores/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { stores } from '@/db/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await db.select().from(stores).orderBy(asc(stores.name));
  return NextResponse.json({ stores: rows });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run app/api/stores/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/stores
git commit -m "feat: add GET /api/stores"
```

---

### Task 4: `middleware.ts` — porta de entrada por loja

**Files:**
- Create: `middleware.ts`
- Create: `middleware.test.ts`

**Interfaces:**
- Consumes: nada de outras tasks (só o cookie `store_id`, mesmo nome usado em `lib/store.ts`).
- Produces: `middleware(req: NextRequest): NextResponse`, `config.matcher`.

- [ ] **Step 1: Escrever o teste**

Create `middleware.test.ts`:

```ts
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from './middleware';

describe('middleware', () => {
  it('redirects to /loja when there is no store_id cookie', () => {
    const req = new NextRequest('http://localhost/products');
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/loja');
  });

  it('redirects to /loja when store_id is not numeric', () => {
    const req = new NextRequest('http://localhost/products', { headers: { cookie: 'store_id=abc' } });
    const res = middleware(req);
    expect(res.status).toBe(307);
  });

  it('passes through when a numeric store_id cookie is present', () => {
    const req = new NextRequest('http://localhost/products', { headers: { cookie: 'store_id=1' } });
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it('does not redirect requests to /loja itself', () => {
    const req = new NextRequest('http://localhost/loja');
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it('does not redirect requests to /api/stores', () => {
    const req = new NextRequest('http://localhost/api/stores');
    const res = middleware(req);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run middleware.test.ts`
Expected: FAIL — módulo `./middleware` não existe.

- [ ] **Step 3: Implementar `middleware.ts`**

Create `middleware.ts` (raiz do projeto, ao lado de `next.config.js`):

```ts
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/loja', '/api/stores'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const storeId = req.cookies.get('store_id')?.value;
  if (!storeId || !/^\d+$/.test(storeId)) {
    const url = req.nextUrl.clone();
    url.pathname = '/loja';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run middleware.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add middleware.ts middleware.test.ts
git commit -m "feat: gate the whole app behind a store selection via middleware"
```

---

### Task 5: Página `/loja` — seleção de loja

**Files:**
- Create: `app/loja/page.tsx`
- Create: `app/loja/page.test.tsx`

**Interfaces:**
- Consumes: `GET /api/stores` (Task 3).
- Produces: página client-side que grava o cookie `store_id` via `document.cookie` ao clicar numa loja.

- [ ] **Step 1: Escrever o teste**

Create `app/loja/page.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LojaPage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'store_id=; path=/; max-age=0';
});

describe('LojaPage', () => {
  it('lists the stores returned by the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          stores: [
            { id: 2, name: 'Campo Grande-MS', slug: 'campo-grande-ms' },
            { id: 1, name: 'Coxim-MS', slug: 'coxim-ms' },
          ],
        }),
      }),
    );
    render(<LojaPage />);
    await waitFor(() => expect(screen.getByText('Campo Grande-MS')).toBeInTheDocument());
    expect(screen.getByText('Coxim-MS')).toBeInTheDocument();
  });

  it('sets the store_id cookie when a store is chosen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ stores: [{ id: 1, name: 'Coxim-MS', slug: 'coxim-ms' }] }),
      }),
    );
    render(<LojaPage />);
    await waitFor(() => expect(screen.getByText('Coxim-MS')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Coxim-MS'));
    expect(document.cookie).toContain('store_id=1');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run app/loja/page.test.tsx`
Expected: FAIL — módulo `./page` não existe.

- [ ] **Step 3: Implementar a página**

Create `app/loja/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

interface Store {
  id: number;
  name: string;
  slug: string;
}

export default function LojaPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);

  useEffect(() => {
    fetch('/api/stores')
      .then((r) => r.json())
      .then((d) => setStores(d.stores));
  }, []);

  function selectStore(storeId: number) {
    document.cookie = `store_id=${storeId}; path=/`;
    router.push('/');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Selecione a loja</h1>
      <div className="flex w-full flex-col gap-4">
        {stores.map((store) => (
          <Button
            key={store.id}
            variant="secondary"
            onClick={() => selectStore(store.id)}
            className="w-full py-8 text-2xl uppercase"
          >
            {store.name}
          </Button>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run app/loja/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/loja
git commit -m "feat: add /loja store selection page"
```

---

### Task 6: "Trocar loja" na navegação

**Files:**
- Modify: `components/ui/Nav.tsx`
- Modify: `components/ui/Nav.test.tsx`

**Interfaces:**
- Consumes: nada novo (usa `useRouter` já mockado globalmente em `tests/setupMatchers.ts`).

- [ ] **Step 1: Adicionar o teste**

No fim do `describe('Nav', ...)` em `components/ui/Nav.test.tsx`, adicione:

```tsx
  it('shows a Trocar loja button that clears the store cookie', () => {
    document.cookie = 'store_id=1; path=/';
    render(<Nav />);
    fireEvent.click(screen.getByRole('button', { name: 'Trocar loja' }));
    expect(document.cookie).not.toContain('store_id=1');
  });
```

E ajuste o import no topo do arquivo para incluir `fireEvent`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run components/ui/Nav.test.tsx`
Expected: FAIL — não existe botão "Trocar loja".

- [ ] **Step 3: Implementar no `Nav.tsx`**

Substitua o arquivo inteiro por:

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Início' },
  { href: '/history', label: 'Histórico' },
  { href: '/products', label: 'Produtos' },
  { href: '/groups', label: 'Grupos' },
  { href: '/settings', label: 'Configurações' },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  function trocarLoja() {
    document.cookie = 'store_id=; path=/; max-age=0';
    router.push('/loja');
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-gray-200 bg-paper">
      <ul className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-2 py-2 sm:gap-2 sm:px-4">
        {LINKS.map((link) => {
          const isActive = link.href === '/' ? pathname === '/' : pathname?.startsWith(link.href);
          return (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-accent-light text-accent' : 'text-gray-600 hover:bg-canvas hover:text-ink'
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
        <li className="shrink-0">
          <button
            type="button"
            onClick={trocarLoja}
            className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-canvas hover:text-ink"
          >
            Trocar loja
          </button>
        </li>
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run components/ui/Nav.test.tsx`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add components/ui/Nav.tsx components/ui/Nav.test.tsx
git commit -m "feat: add Trocar loja link to the nav"
```

---

### Task 7: Rotas de Grupos por loja

**Files:**
- Modify: `app/api/groups/route.ts`
- Modify: `app/api/groups/route.test.ts`
- Modify: `app/api/groups/[id]/route.ts`
- Modify: `app/api/groups/[id]/route.test.ts`

**Interfaces:**
- Consumes: `getStoreIdFromRequest` de `lib/store.ts` (Task 2), `storeRequest`/`getTestStoreId` de `tests/testStores.ts` (Task 1).

- [ ] **Step 1: Reescrever `app/api/groups/route.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { GET, POST } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

function postReq(body: unknown) {
  return storeRequest('http://localhost/api/groups', storeId, { method: 'POST', body: JSON.stringify(body) });
}

describe('/api/groups', () => {
  it('starts empty', async () => {
    const res = await GET(storeRequest('http://localhost/api/groups', storeId));
    const data = await res.json();
    expect(data.groups).toEqual([]);
  });

  it('creates a group', async () => {
    const res = await POST(postReq({ prefix: '789123', name: 'Cueca Slip Preta' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.group.prefix).toBe('789123');
  });

  it('rejects a duplicate prefix', async () => {
    await POST(postReq({ prefix: '789123', name: 'A' }));
    const res = await POST(postReq({ prefix: '789123', name: 'B' }));
    expect(res.status).toBe(409);
  });

  it('allows the same prefix to be registered in a different store', async () => {
    await POST(postReq({ prefix: '789123', name: 'A' }));
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const res = await POST(
      storeRequest('http://localhost/api/groups', otherStoreId, {
        method: 'POST',
        body: JSON.stringify({ prefix: '789123', name: 'B' }),
      }),
    );
    expect(res.status).toBe(201);
  });

  it('only lists groups from the current store', async () => {
    await POST(postReq({ prefix: '111', name: 'Loja atual' }));
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await POST(
      storeRequest('http://localhost/api/groups', otherStoreId, {
        method: 'POST',
        body: JSON.stringify({ prefix: '222', name: 'Outra loja' }),
      }),
    );

    const res = await GET(storeRequest('http://localhost/api/groups', storeId));
    const data = await res.json();
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0].name).toBe('Loja atual');
  });

  it('rejects an empty name', async () => {
    const res = await POST(postReq({ prefix: '1', name: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 invalid_json when the body is malformed', async () => {
    const res = await POST(storeRequest('http://localhost/api/groups', storeId, { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_json');
  });
});
```

- [ ] **Step 2: Reescrever `app/api/groups/[id]/route.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { groups } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { DELETE, PUT } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

async function createGroup(overrideStoreId = storeId) {
  const [row] = await db.insert(groups).values({ storeId: overrideStoreId, prefix: '789123', name: 'Cueca Slip Preta' }).returning();
  return row;
}

describe('/api/groups/:id', () => {
  it('renames a group', async () => {
    const group = await createGroup();
    const res = await PUT(
      storeRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ name: 'Novo nome' }) }),
      { params: { id: String(group.id) } },
    );
    const data = await res.json();
    expect(data.group.name).toBe('Novo nome');
  });

  it('returns 404 when renaming a group that does not exist', async () => {
    const res = await PUT(
      storeRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ name: 'X' }) }),
      { params: { id: '999999' } },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when renaming a group that belongs to a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const group = await createGroup(otherStoreId);
    const res = await PUT(
      storeRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ name: 'X' }) }),
      { params: { id: String(group.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('deletes a group', async () => {
    const group = await createGroup();
    const res = await DELETE(storeRequest('http://localhost', storeId, { method: 'DELETE' }), {
      params: { id: String(group.id) },
    });
    expect(res.status).toBe(200);
  });

  it('returns 404 when deleting a group that belongs to a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const group = await createGroup(otherStoreId);
    const res = await DELETE(storeRequest('http://localhost', storeId, { method: 'DELETE' }), {
      params: { id: String(group.id) },
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-integer id on PUT instead of throwing', async () => {
    const res = await PUT(storeRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ name: 'X' }) }), {
      params: { id: 'abc' },
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-integer id on DELETE instead of throwing', async () => {
    const res = await DELETE(storeRequest('http://localhost', storeId, { method: 'DELETE' }), { params: { id: 'abc' } });
    expect(res.status).toBe(404);
  });

  it('returns 400 invalid_json when the PUT body is malformed', async () => {
    const group = await createGroup();
    const res = await PUT(storeRequest('http://localhost', storeId, { method: 'PUT', body: '{not json' }), {
      params: { id: String(group.id) },
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_json');
  });
});
```

- [ ] **Step 3: Rodar e confirmar que ambos falham**

Run: `npx vitest run app/api/groups`
Expected: FAIL (as rotas ainda não leem o cookie nem filtram por loja).

- [ ] **Step 4: Reescrever `app/api/groups/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { groups } from '@/db/schema';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  const rows = await db.select().from(groups).where(eq(groups.storeId, storeId)).orderBy(asc(groups.prefix));
  return NextResponse.json({ groups: rows });
}

export async function POST(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const prefix = String(body.prefix ?? '').trim();
  const name = String(body.name ?? '').trim();
  if (!prefix || !name) {
    return NextResponse.json({ error: 'invalid_group' }, { status: 400 });
  }
  try {
    const [row] = await db.insert(groups).values({ storeId, prefix, name }).returning();
    return NextResponse.json({ group: row }, { status: 201 });
  } catch (err: any) {
    if (err.code === '23505') {
      return NextResponse.json({ error: 'prefix_already_registered' }, { status: 409 });
    }
    throw err;
  }
}
```

- [ ] **Step 5: Reescrever `app/api/groups/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { groups } from '@/db/schema';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const storeId = getStoreIdFromRequest(req);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const name = String(body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'invalid_group' }, { status: 400 });
  }
  const [row] = await db
    .update(groups)
    .set({ name })
    .where(and(eq(groups.id, id), eq(groups.storeId, storeId)))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ group: row });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const storeId = getStoreIdFromRequest(req);
  const [row] = await db
    .delete(groups)
    .where(and(eq(groups.id, id), eq(groups.storeId, storeId)))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npx vitest run app/api/groups`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/groups
git commit -m "feat: scope Groups routes by store"
```

---

### Task 8: Rotas de Produtos (SKUs) por loja

**Files:**
- Modify: `app/api/products/route.ts`
- Modify: `app/api/products/route.test.ts`
- Modify: `app/api/products/[barcode]/route.ts`
- Modify: `app/api/products/[barcode]/route.test.ts`
- Modify: `app/api/products/import/route.ts`
- Modify: `app/api/products/import/route.test.ts`

**Interfaces:**
- Consumes: `getStoreIdFromRequest` (Task 2), `storeRequest`/`getTestStoreId` (Task 1).

- [ ] **Step 1: Reescrever `app/api/products/route.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { settings } from '@/db/schema';
import { REQUIRE_SKU_KEY } from '@/lib/getRequireSku';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { GET, POST } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

function getReq(query = '') {
  return storeRequest(`http://localhost/api/products${query}`, storeId);
}

function postReq(body: unknown) {
  return storeRequest('http://localhost/api/products', storeId, { method: 'POST', body: JSON.stringify(body) });
}

describe('/api/products', () => {
  it('starts empty', async () => {
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.products).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('creates a product', async () => {
    const res = await POST(postReq({ barcode: '7891234000011', sku: 'CUECA-SLIP-P', name: 'Cueca Slip Preta P' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.product).toMatchObject({ barcode: '7891234000011', sku: 'CUECA-SLIP-P', name: 'Cueca Slip Preta P' });
  });

  it('lists created products ordered by name', async () => {
    await POST(postReq({ barcode: '2', sku: 'B', name: 'Zebra' }));
    await POST(postReq({ barcode: '1', sku: 'A', name: 'Abacaxi' }));
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.products.map((p: { barcode: string }) => p.barcode)).toEqual(['1', '2']);
  });

  it('only lists products from the current store', async () => {
    await POST(postReq({ barcode: '1', sku: 'A', name: 'Loja atual' }));
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await POST(
      storeRequest('http://localhost/api/products', otherStoreId, {
        method: 'POST',
        body: JSON.stringify({ barcode: '1', sku: 'B', name: 'Outra loja' }),
      }),
    );

    const res = await GET(getReq());
    const data = await res.json();
    expect(data.products).toHaveLength(1);
    expect(data.products[0].name).toBe('Loja atual');
  });

  it('filters by a search term across name, sku, and barcode', async () => {
    await POST(postReq({ barcode: '7891234000011', sku: 'CUECA-SLIP-P', name: 'Cueca Slip Preta' }));
    await POST(postReq({ barcode: '7891234000028', sku: 'SUTIA-P', name: 'Sutia Power' }));

    const byName = await GET(getReq('?q=cueca'));
    expect((await byName.json()).products).toHaveLength(1);

    const bySku = await GET(getReq('?q=SUTIA-P'));
    expect((await bySku.json()).products).toHaveLength(1);

    const byBarcode = await GET(getReq('?q=7891234000028'));
    expect((await byBarcode.json()).products).toHaveLength(1);

    const noMatch = await GET(getReq('?q=inexistente'));
    expect((await noMatch.json()).products).toHaveLength(0);
  });

  it('paginates results', async () => {
    for (let i = 1; i <= 5; i++) {
      await POST(postReq({ barcode: String(i), sku: `SKU-${i}`, name: `Produto ${i}` }));
    }
    const page1 = await GET(getReq('?pageSize=2&page=1'));
    const data1 = await page1.json();
    expect(data1.products).toHaveLength(2);
    expect(data1.total).toBe(5);

    const page3 = await GET(getReq('?pageSize=2&page=3'));
    const data3 = await page3.json();
    expect(data3.products).toHaveLength(1);
  });

  it('rejects a duplicate barcode within the same store', async () => {
    await POST(postReq({ barcode: '1', sku: 'A', name: 'A' }));
    const res = await POST(postReq({ barcode: '1', sku: 'B', name: 'B' }));
    expect(res.status).toBe(409);
  });

  it('allows the same barcode to be registered in a different store', async () => {
    await POST(postReq({ barcode: '1', sku: 'A', name: 'A' }));
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const res = await POST(
      storeRequest('http://localhost/api/products', otherStoreId, {
        method: 'POST',
        body: JSON.stringify({ barcode: '1', sku: 'B', name: 'B' }),
      }),
    );
    expect(res.status).toBe(201);
  });

  it('rejects an empty barcode or name regardless of the require-SKU setting', async () => {
    const res = await POST(postReq({ barcode: '', sku: 'A', name: 'A' }));
    expect(res.status).toBe(400);
  });

  it('rejects an empty sku when "Exigir SKU" is on (the default)', async () => {
    const res = await POST(postReq({ barcode: '1', sku: '', name: 'A' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('sku_required');
  });

  it('allows an empty sku when "Exigir SKU" is off', async () => {
    await db.insert(settings).values({ key: REQUIRE_SKU_KEY, value: 'false' });
    const res = await POST(postReq({ barcode: '78947467', sku: '', name: 'Produto qualquer' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.product).toMatchObject({ barcode: '78947467', sku: null, name: 'Produto qualquer' });
  });

  it('rejects malformed JSON', async () => {
    const res = await POST(storeRequest('http://localhost/api/products', storeId, { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Reescrever `app/api/products/[barcode]/route.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { settings, skus } from '@/db/schema';
import { REQUIRE_SKU_KEY } from '@/lib/getRequireSku';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { DELETE, PUT } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

async function createProduct(overrideStoreId = storeId) {
  const [row] = await db
    .insert(skus)
    .values({ storeId: overrideStoreId, barcode: '7891234000011', sku: 'CUECA-SLIP-P', name: 'Cueca Slip Preta P' })
    .returning();
  return row;
}

describe('/api/products/:barcode', () => {
  it('edits sku and name', async () => {
    await createProduct();
    const res = await PUT(
      storeRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ sku: 'NOVO-SKU', name: 'Novo nome' }) }),
      { params: { barcode: '7891234000011' } },
    );
    const data = await res.json();
    expect(data.product).toMatchObject({ sku: 'NOVO-SKU', name: 'Novo nome' });
  });

  it('returns 404 when editing a barcode that does not exist', async () => {
    const res = await PUT(
      storeRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ sku: 'X', name: 'X' }) }),
      { params: { barcode: '0000000000000' } },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when editing a barcode that belongs to a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await createProduct(otherStoreId);
    const res = await PUT(
      storeRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ sku: 'X', name: 'X' }) }),
      { params: { barcode: '7891234000011' } },
    );
    expect(res.status).toBe(404);
  });

  it('rejects an empty name on edit regardless of the require-SKU setting', async () => {
    await createProduct();
    const res = await PUT(
      storeRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ sku: 'X', name: '' }) }),
      { params: { barcode: '7891234000011' } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects an empty sku on edit when "Exigir SKU" is on (the default)', async () => {
    await createProduct();
    const res = await PUT(
      storeRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ sku: '', name: 'X' }) }),
      { params: { barcode: '7891234000011' } },
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('sku_required');
  });

  it('allows clearing the sku on edit when "Exigir SKU" is off', async () => {
    await createProduct();
    await db.insert(settings).values({ key: REQUIRE_SKU_KEY, value: 'false' });
    const res = await PUT(
      storeRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ sku: '', name: 'Sem SKU mesmo' }) }),
      { params: { barcode: '7891234000011' } },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.product).toMatchObject({ sku: null, name: 'Sem SKU mesmo' });
  });

  it('removes a product', async () => {
    await createProduct();
    const res = await DELETE(storeRequest('http://localhost', storeId, { method: 'DELETE' }), {
      params: { barcode: '7891234000011' },
    });
    expect(res.status).toBe(200);
    const remaining = await db.select().from(skus);
    expect(remaining).toHaveLength(0);
  });

  it('returns 404 when removing a barcode that does not exist', async () => {
    const res = await DELETE(storeRequest('http://localhost', storeId, { method: 'DELETE' }), {
      params: { barcode: '0000000000000' },
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when removing a barcode that belongs to a different store, leaving it intact', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await createProduct(otherStoreId);
    const res = await DELETE(storeRequest('http://localhost', storeId, { method: 'DELETE' }), {
      params: { barcode: '7891234000011' },
    });
    expect(res.status).toBe(404);
    const remaining = await db.select().from(skus);
    expect(remaining).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Reescrever `app/api/products/import/route.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { skus } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { POST } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

function postReq(csv: string) {
  return storeRequest('http://localhost', storeId, { method: 'POST', body: JSON.stringify({ csv }) });
}

describe('/api/products/import', () => {
  it('creates new products from valid rows', async () => {
    const csv = 'nome;sku;codebar\nCueca Slip Preta P;CUECA-SLIP-P;7891234000011\nCueca Slip Preta M;CUECA-SLIP-M;7891234000028';
    const res = await POST(postReq(csv));
    const data = await res.json();
    expect(data.created).toBe(2);
    expect(data.updated).toBe(0);
    expect(data.errors).toEqual([]);
    const rows = await db.select().from(skus);
    expect(rows).toHaveLength(2);
  });

  it('overwrites sku and name when the barcode already exists in the same store', async () => {
    await db.insert(skus).values({ storeId, barcode: '7891234000011', sku: 'ANTIGO', name: 'Nome antigo' });
    const csv = 'nome;sku;codebar\nNome novo;NOVO-SKU;7891234000011';
    const res = await POST(postReq(csv));
    const data = await res.json();
    expect(data.created).toBe(0);
    expect(data.updated).toBe(1);
    const rows = await db.select().from(skus);
    expect(rows[0]).toMatchObject({ sku: 'NOVO-SKU', name: 'Nome novo' });
  });

  it('creates a new row instead of overwriting when the same barcode exists in a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await db.insert(skus).values({ storeId: otherStoreId, barcode: '7891234000011', sku: 'OUTRA-LOJA', name: 'Outra loja' });
    const csv = 'nome;sku;codebar\nNome novo;NOVO-SKU;7891234000011';
    const res = await POST(postReq(csv));
    const data = await res.json();
    expect(data.created).toBe(1);
    expect(data.updated).toBe(0);
    const rows = await db.select().from(skus);
    expect(rows).toHaveLength(2);
  });

  it('reports invalid rows without failing the whole import', async () => {
    const csv = 'nome;sku;codebar\nX;Y;abc\nCueca Slip Preta P;CUECA-SLIP-P;7891234000011';
    const res = await POST(postReq(csv));
    const data = await res.json();
    expect(data.created).toBe(1);
    expect(data.errors).toEqual([{ line: 2, reason: 'código de barras vazio ou não numérico' }]);
  });

  it('returns 400 invalid_csv_header for a file missing the required columns', async () => {
    const res = await POST(postReq('a;b\n1;2'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_csv_header');
  });

  it('rejects malformed JSON', async () => {
    const res = await POST(storeRequest('http://localhost', storeId, { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 4: Rodar e confirmar que os três arquivos falham**

Run: `npx vitest run app/api/products`
Expected: FAIL.

- [ ] **Step 5: Reescrever `app/api/products/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { skus } from '@/db/schema';
import { getRequireSku } from '@/lib/getRequireSku';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function GET(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE),
  );

  const searchCondition = q ? or(ilike(skus.name, `%${q}%`), ilike(skus.sku, `%${q}%`), ilike(skus.barcode, `%${q}%`)) : undefined;
  const where = searchCondition ? and(eq(skus.storeId, storeId), searchCondition) : eq(skus.storeId, storeId);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(skus).where(where);
  const rows = await db
    .select()
    .from(skus)
    .where(where)
    .orderBy(asc(skus.name), asc(skus.barcode))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return NextResponse.json({ products: rows, total: count, page, pageSize });
}

export async function POST(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const barcode = String(body.barcode ?? '').trim();
  const skuInput = String(body.sku ?? '').trim();
  const name = String(body.name ?? '').trim();
  if (!barcode || !name) {
    return NextResponse.json({ error: 'invalid_product' }, { status: 400 });
  }
  if (!skuInput && (await getRequireSku(db))) {
    return NextResponse.json({ error: 'sku_required' }, { status: 400 });
  }
  try {
    const [row] = await db.insert(skus).values({ storeId, barcode, sku: skuInput || null, name }).returning();
    return NextResponse.json({ product: row }, { status: 201 });
  } catch (err: any) {
    if (err.code === '23505') {
      return NextResponse.json({ error: 'barcode_already_registered' }, { status: 409 });
    }
    throw err;
  }
}
```

- [ ] **Step 6: Reescrever `app/api/products/[barcode]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { skus } from '@/db/schema';
import { getRequireSku } from '@/lib/getRequireSku';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request, { params }: { params: { barcode: string } }) {
  const storeId = getStoreIdFromRequest(req);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const skuInput = String(body.sku ?? '').trim();
  const name = String(body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'invalid_product' }, { status: 400 });
  }
  if (!skuInput && (await getRequireSku(db))) {
    return NextResponse.json({ error: 'sku_required' }, { status: 400 });
  }
  const [row] = await db
    .update(skus)
    .set({ sku: skuInput || null, name })
    .where(and(eq(skus.storeId, storeId), eq(skus.barcode, params.barcode)))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ product: row });
}

export async function DELETE(req: Request, { params }: { params: { barcode: string } }) {
  const storeId = getStoreIdFromRequest(req);
  const [row] = await db
    .delete(skus)
    .where(and(eq(skus.storeId, storeId), eq(skus.barcode, params.barcode)))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Reescrever `app/api/products/import/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { skus } from '@/db/schema';
import { InvalidCsvHeaderError, parseProductsCsv } from '@/lib/parseProductsCsv';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const csv = typeof body.csv === 'string' ? body.csv : '';

  let parsed;
  try {
    parsed = parseProductsCsv(csv);
  } catch (err) {
    if (err instanceof InvalidCsvHeaderError) {
      return NextResponse.json({ error: 'invalid_csv_header' }, { status: 400 });
    }
    throw err;
  }

  let created = 0;
  let updated = 0;
  for (const row of parsed.rows) {
    const existing = await db.select().from(skus).where(and(eq(skus.storeId, storeId), eq(skus.barcode, row.barcode))).limit(1);
    if (existing[0]) {
      await db.update(skus).set({ sku: row.sku, name: row.name }).where(and(eq(skus.storeId, storeId), eq(skus.barcode, row.barcode)));
      updated++;
    } else {
      await db.insert(skus).values({ storeId, barcode: row.barcode, sku: row.sku, name: row.name });
      created++;
    }
  }

  return NextResponse.json({ created, updated, errors: parsed.errors });
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `npx vitest run app/api/products`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/api/products
git commit -m "feat: scope Products (skus) routes by store"
```

---

### Task 9: `lib/scanCounting.ts` — SKUs e Grupos escopados por loja internamente

**Files:**
- Modify: `lib/scanCounting.ts`
- Modify: `lib/scanCounting.test.ts`

**Interfaces:**
- `recordScan(db, countingId, rawBarcode, sku?, scannedAt?): Promise<ScanOutcome>` — **assinatura pública não muda**. Internamente passa a derivar `storeId` da própria `counting` carregada (`counting.storeId`) e usá-lo para filtrar `skus`/`groups`. Isso mantém todo teste que já chama `recordScan(...)` funcionando sem alteração — só os fixtures que inserem `countings`/`groups`/`skus` diretamente precisam de `storeId`.

- [ ] **Step 1: Ajustar os fixtures em `lib/scanCounting.test.ts`**

No topo do arquivo, troque:

```ts
import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { countings, groups, skus } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { CountingNotActiveError, InvalidBarcodeError, SkuRequiredError, recordScan } from './scanCounting';

beforeEach(resetDb);

async function createActiveCounting(prefixLength = 7, requireSku = true) {
  const [row] = await db
    .insert(countings)
    .values({ name: 'Teste', prefixLengthUsed: prefixLength, requireSkuUsed: requireSku, status: 'active' })
    .returning();
  return row;
}
```

por:

```ts
import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { countings, groups, skus } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId } from '@/tests/testStores';
import { CountingNotActiveError, InvalidBarcodeError, SkuRequiredError, recordScan } from './scanCounting';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

async function createActiveCounting(prefixLength = 7, requireSku = true) {
  const [row] = await db
    .insert(countings)
    .values({ storeId, name: 'Teste', prefixLengthUsed: prefixLength, requireSkuUsed: requireSku, status: 'active' })
    .returning();
  return row;
}
```

Em seguida, ajuste as duas linhas que inserem direto em `groups`/`skus` nos testes:

- `await db.insert(groups).values({ prefix: '789123', name: 'Cueca Slip Preta' });` → `await db.insert(groups).values({ storeId, prefix: '789123', name: 'Cueca Slip Preta' });`
- `await db.insert(skus).values({ barcode: '7891234000011', sku: null, name: 'Produto sem SKU' });` → `await db.insert(skus).values({ storeId, barcode: '7891234000011', sku: null, name: 'Produto sem SKU' });`

Todas as chamadas a `recordScan(db, counting.id, ...)` **permanecem exatamente como estão** — não mudam.

Adicione também, no fim do `describe('recordScan', ...)`, um teste que comprova o isolamento entre lojas:

```ts
  it('does not resolve a SKU registered under the same barcode in a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await db.insert(skus).values({ storeId: otherStoreId, barcode: '7891234000011', sku: 'OUTRA-LOJA' });
    const counting = await createActiveCounting();
    await expect(recordScan(db, counting.id, '7891234000011')).rejects.toThrow(SkuRequiredError);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/scanCounting.test.ts`
Expected: FAIL (o teste novo falha porque `recordScan` ainda resolve SKU globalmente, ignorando a loja; os demais devem seguir passando já que os fixtures foram corrigidos).

- [ ] **Step 3: Editar `lib/scanCounting.ts`**

Altere as assinaturas e corpos de `findLinkedSku` e `findOrResolveSku` para receberem `storeId`, e o `recordScan` para passá-lo adiante e escopar a busca de grupos. Substitua o arquivo inteiro por:

```ts
import { and, desc, eq, sql } from 'drizzle-orm';
import { boxes, countings, groups, scans, skus } from '@/db/schema';
import type { DbClient } from '@/db/client';
import { extractPrefix, isValidBarcode } from './prefix';
import { isDuplicateScan } from './dedupe';
import { resolveGroupName } from './groupMatch';

export class InvalidBarcodeError extends Error {}
export class CountingNotFoundError extends Error {}
export class CountingNotActiveError extends Error {}
export class SkuRequiredError extends Error {}

export interface BoxHit {
  boxId: number;
  boxNumber: number;
  prefix: string;
  groupName: string | null;
  sku: string | null;
  total: number;
}

export interface ScanOutcome {
  duplicate: boolean;
  box: BoxHit | null;
}

interface BoxRow {
  id: number;
  countingId: number;
  boxNumber: number;
  prefix: string;
}

async function findExistingBox(db: DbClient, countingId: number, prefix: string): Promise<BoxRow | undefined> {
  const rows = await db
    .select()
    .from(boxes)
    .where(and(eq(boxes.countingId, countingId), eq(boxes.prefix, prefix)))
    .limit(1);
  return rows[0];
}

async function findOrCreateBox(db: DbClient, countingId: number, prefix: string): Promise<BoxRow> {
  const existing = await findExistingBox(db, countingId, prefix);
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await db.execute(sql`
        INSERT INTO boxes (counting_id, prefix, box_number)
        SELECT ${countingId}, ${prefix},
          COALESCE((SELECT MAX(box_number) FROM boxes WHERE counting_id = ${countingId}), 0) + 1
        ON CONFLICT (counting_id, prefix) DO NOTHING
        RETURNING id, counting_id AS "countingId", box_number AS "boxNumber", prefix
      `);
      const created = (result as any).rows?.[0] as BoxRow | undefined;
      if (created) return created;
    } catch (err: any) {
      if (err.code !== '23505') throw err;
    }
    const retry = await findExistingBox(db, countingId, prefix);
    if (retry) return retry;
  }
  throw new Error('failed_to_create_box');
}

async function findLinkedSku(db: DbClient, storeId: number, barcode: string): Promise<{ found: boolean; sku: string | null }> {
  const rows = await db.select().from(skus).where(and(eq(skus.storeId, storeId), eq(skus.barcode, barcode))).limit(1);
  if (!rows[0]) return { found: false, sku: null };
  return { found: true, sku: rows[0].sku };
}

async function findOrResolveSku(
  db: DbClient,
  storeId: number,
  barcode: string,
  providedSku: string | undefined,
  requireSku: boolean,
): Promise<string | null> {
  const existing = await findLinkedSku(db, storeId, barcode);
  // A barcode that's already registered is "resolved" even if it was
  // registered without a SKU (allowed when "Exigir SKU" is off) — it
  // should never be treated the same as a totally unknown barcode.
  if (existing.found) return existing.sku;

  const trimmed = (providedSku ?? '').trim();
  if (!trimmed) {
    if (requireSku) throw new SkuRequiredError();
    return null;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await db.execute(sql`
        INSERT INTO skus (store_id, barcode, sku) VALUES (${storeId}, ${barcode}, ${trimmed})
        ON CONFLICT (store_id, barcode) DO NOTHING
        RETURNING sku
      `);
      const created = (result as any).rows?.[0] as { sku: string } | undefined;
      if (created) return created.sku;
    } catch (err: any) {
      if (err.code !== '23505') throw err;
    }
    const retry = await findLinkedSku(db, storeId, barcode);
    if (retry.found) return retry.sku;
  }
  throw new Error('failed_to_link_sku');
}

/**
 * Records a scan and returns the box hit and duplicate status.
 * MUST be called with the pooled db client, never inside an outer transaction.
 * The retry loops for box creation and SKU linking rely on catching raw Postgres
 * unique-constraint violations and retrying with a fresh query, which only works
 * in autocommit mode. Inside a transaction, a unique violation aborts the entire
 * transaction and subsequent retry queries would fail.
 */
export async function recordScan(
  db: DbClient,
  countingId: number,
  rawBarcode: string,
  sku?: string,
  scannedAt?: Date,
): Promise<ScanOutcome> {
  const countingRows = await db.select().from(countings).where(eq(countings.id, countingId)).limit(1);
  const counting = countingRows[0];
  if (!counting) throw new CountingNotFoundError();
  if (counting.status !== 'active') throw new CountingNotActiveError();

  const prefixLength = counting.prefixLengthUsed;
  const barcode = rawBarcode.trim();
  if (!isValidBarcode(barcode, prefixLength)) throw new InvalidBarcodeError();

  const effectiveNow = scannedAt ?? new Date();

  const prefix = extractPrefix(barcode, prefixLength);
  const existingBox = await findExistingBox(db, countingId, prefix);

  if (existingBox) {
    const lastScanRows = await db
      .select()
      .from(scans)
      .where(eq(scans.boxId, existingBox.id))
      .orderBy(desc(scans.scannedAt))
      .limit(1);
    const last = lastScanRows[0];
    if (isDuplicateScan(last?.scannedAt ?? null, last?.barcode ?? null, barcode, effectiveNow)) {
      return { duplicate: true, box: null };
    }
  }

  const resolvedSku = await findOrResolveSku(db, counting.storeId, barcode, sku, counting.requireSkuUsed);

  const box = existingBox ?? (await findOrCreateBox(db, countingId, prefix));
  await db.insert(scans).values({ boxId: box.id, barcode, scannedAt: effectiveNow });

  const countResult = await db.execute(sql`SELECT COUNT(*)::int AS count FROM scans WHERE box_id = ${box.id}`);
  const total = Number((countResult as any).rows[0].count);

  const allGroups = await db.select().from(groups).where(eq(groups.storeId, counting.storeId));
  const groupName = resolveGroupName(box.prefix, allGroups);

  return {
    duplicate: false,
    box: { boxId: box.id, boxNumber: box.boxNumber, prefix: box.prefix, groupName, sku: resolvedSku, total },
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/scanCounting.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/scanCounting.ts lib/scanCounting.test.ts
git commit -m "feat: scope SKU and group lookups by the counting's store in recordScan"
```

---

### Task 10: Rotas de Contagens por loja

**Files:**
- Modify: `app/api/countings/route.ts`
- Modify: `app/api/countings/route.test.ts`
- Modify: `app/api/countings/[id]/route.ts`
- Modify: `app/api/countings/[id]/route.test.ts`
- Modify: `app/api/countings/[id]/scan/route.ts`
- Modify: `app/api/countings/[id]/scan/route.test.ts`
- Modify: `app/api/countings/[id]/finish/route.ts`
- Modify: `app/api/countings/[id]/finish/route.test.ts`
- Modify: `app/api/countings/import-xml/route.ts`
- Modify: `app/api/countings/import-xml/route.test.ts`

**Interfaces:**
- Consumes: `getStoreIdFromRequest` (Task 2), `storeRequest`/`getTestStoreId` (Task 1), `recordScan` inalterado (Task 9).

- [ ] **Step 1: Reescrever `app/api/countings/route.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { settings } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { GET, POST } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

function postReq(body: unknown) {
  return storeRequest('http://localhost', storeId, { method: 'POST', body: JSON.stringify(body) });
}

function getReq(query = '') {
  return storeRequest(`http://localhost/api/countings${query}`, storeId);
}

describe('/api/countings', () => {
  it('creates a counting with the current prefix length frozen onto it', async () => {
    const res = await POST(postReq({ name: 'Entrega Lupo 03/09' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.counting.name).toBe('Entrega Lupo 03/09');
    expect(data.counting.status).toBe('active');
    expect(data.counting.prefixLengthUsed).toBe(7);
    expect(data.counting.requireSkuUsed).toBe(true);
  });

  it('freezes requireSkuUsed as false when the setting was turned off before creation', async () => {
    await db.insert(settings).values({ key: 'require_sku', value: 'false' });
    const res = await POST(postReq({ name: 'Sem SKU' }));
    const data = await res.json();
    expect(data.counting.requireSkuUsed).toBe(false);
  });

  it('rejects creating a counting without a name', async () => {
    const res = await POST(postReq({ name: '' }));
    expect(res.status).toBe(400);
  });

  it('lists only active countings when filtered', async () => {
    await POST(postReq({ name: 'A' }));
    const res = await GET(getReq('?status=active'));
    const data = await res.json();
    expect(data.countings).toHaveLength(1);
  });

  it('lists no finished countings when none have been finished', async () => {
    await POST(postReq({ name: 'A' }));
    const res = await GET(getReq('?status=finished'));
    const data = await res.json();
    expect(data.countings).toHaveLength(0);
  });

  it('filters by name search', async () => {
    await POST(postReq({ name: 'Entrega Lupo' }));
    await POST(postReq({ name: 'Contagem geral' }));

    const res = await GET(getReq('?q=lupo'));
    const data = await res.json();
    expect(data.countings).toHaveLength(1);
  });

  it('only lists countings from the current store', async () => {
    await POST(postReq({ name: 'Loja atual' }));
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await POST(storeRequest('http://localhost', otherStoreId, { method: 'POST', body: JSON.stringify({ name: 'Outra loja' }) }));

    const res = await GET(getReq());
    const data = await res.json();
    expect(data.countings).toHaveLength(1);
    expect(data.countings[0].name).toBe('Loja atual');
  });
});
```

- [ ] **Step 2: Reescrever `app/api/countings/[id]/route.test.ts`**

```ts
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { boxes, countings, groups, invoiceItems, scans } from '@/db/schema';
import { recordScan } from '@/lib/scanCounting';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { DELETE, GET } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

function req() {
  return storeRequest('http://localhost', storeId);
}

describe('/api/countings/:id', () => {
  it('returns 404 for a counting that does not exist', async () => {
    const res = await GET(req(), { params: { id: '999999' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-integer id instead of throwing', async () => {
    const res = await GET(req(), { params: { id: 'abc' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a counting that belongs to a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const [counting] = await db.insert(countings).values({ storeId: otherStoreId, name: 'Outra loja', prefixLengthUsed: 7, status: 'active' }).returning();
    const res = await GET(req(), { params: { id: String(counting.id) } });
    expect(res.status).toBe(404);
  });

  it('returns boxes with totals, SKU breakdown, and the grand total', async () => {
    const [counting] = await db.insert(countings).values({ storeId, name: 'Teste', prefixLengthUsed: 7, status: 'active' }).returning();
    await recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P');
    await recordScan(db, counting.id, '7891234999999', 'CUECA-SLIP-M');
    await recordScan(db, counting.id, '7899999000011', 'OUTRO-SKU');

    const res = await GET(req(), { params: { id: String(counting.id) } });
    const data = await res.json();

    expect(data.boxes).toHaveLength(2);
    expect(data.boxes[0]).toMatchObject({ boxNumber: 1, total: 2, groupName: null });
    expect(data.boxes[0].skuBreakdown).toEqual(
      expect.arrayContaining([
        { barcode: '7891234000011', sku: 'CUECA-SLIP-P', name: null, total: 1 },
        { barcode: '7891234999999', sku: 'CUECA-SLIP-M', name: null, total: 1 },
      ]),
    );
    expect(data.boxes[1]).toMatchObject({ boxNumber: 2, total: 1, groupName: null });
    expect(data.boxes[1].skuBreakdown).toEqual([{ barcode: '7899999000011', sku: 'OUTRO-SKU', name: null, total: 1 }]);
    expect(data.grandTotal).toBe(3);
  });

  it('includes the registered group name for a matching box', async () => {
    await db.insert(groups).values({ storeId, prefix: '789123', name: 'Cueca Slip Preta' });
    const [counting] = await db.insert(countings).values({ storeId, name: 'Teste', prefixLengthUsed: 7, status: 'active' }).returning();
    await recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P');

    const res = await GET(req(), { params: { id: String(counting.id) } });
    const data = await res.json();
    expect(data.boxes[0].groupName).toBe('Cueca Slip Preta');
  });

  it('does not leak a group name registered under the same prefix in a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await db.insert(groups).values({ storeId: otherStoreId, prefix: '789123', name: 'Nome de outra loja' });
    const [counting] = await db.insert(countings).values({ storeId, name: 'Teste', prefixLengthUsed: 7, status: 'active' }).returning();
    await recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P');

    const res = await GET(req(), { params: { id: String(counting.id) } });
    const data = await res.json();
    expect(data.boxes[0].groupName).toBeNull();
  });

  it('shows a "Sem SKU" entry for a scan with no linked SKU when requireSkuUsed is false', async () => {
    const [counting] = await db
      .insert(countings)
      .values({ storeId, name: 'Teste', prefixLengthUsed: 7, requireSkuUsed: false, status: 'active' })
      .returning();
    await recordScan(db, counting.id, '7891234000011'); // no sku provided, none linked -> null
    await recordScan(db, counting.id, '7891234999999', 'CUECA-SLIP-M'); // same box, has a sku

    const res = await GET(req(), { params: { id: String(counting.id) } });
    const data = await res.json();

    expect(data.boxes).toHaveLength(1);
    expect(data.boxes[0].total).toBe(2);
    expect(data.boxes[0].skuBreakdown).toEqual(
      expect.arrayContaining([
        { barcode: '7891234000011', sku: null, name: null, total: 1 },
        { barcode: '7891234999999', sku: 'CUECA-SLIP-M', name: null, total: 1 },
      ]),
    );
  });

  it('returns invoiceCheck as null for a manual counting', async () => {
    const [counting] = await db.insert(countings).values({ storeId, name: 'Teste', prefixLengthUsed: 7, status: 'active' }).returning();
    const res = await GET(req(), { params: { id: String(counting.id) } });
    const data = await res.json();
    expect(data.invoiceCheck).toBeNull();
  });

  it('returns invoiceCheck comparing expected vs counted for an xml-sourced counting', async () => {
    const [counting] = await db
      .insert(countings)
      .values({ storeId, name: 'NF 123', prefixLengthUsed: 7, status: 'active', source: 'xml' })
      .returning();
    await db.insert(invoiceItems).values([
      { countingId: counting.id, barcode: '7891234000011', sku: 'SKU-A', name: 'Produto A', expectedQty: 3 },
      { countingId: counting.id, barcode: '7891234000028', sku: 'SKU-B', name: 'Produto B', expectedQty: 5 },
    ]);
    await recordScan(db, counting.id, '7891234000011', 'SKU-A', new Date('2026-01-01T10:00:00Z'));
    await recordScan(db, counting.id, '7891234000011', 'SKU-A', new Date('2026-01-01T10:00:05Z'));

    const res = await GET(req(), { params: { id: String(counting.id) } });
    const data = await res.json();

    expect(data.invoiceCheck).toEqual(
      expect.arrayContaining([
        { barcode: '7891234000011', sku: 'SKU-A', name: 'Produto A', expectedQty: 3, countedQty: 2 },
        { barcode: '7891234000028', sku: 'SKU-B', name: 'Produto B', expectedQty: 5, countedQty: 0 },
      ]),
    );
  });
});

describe('DELETE /api/countings/:id', () => {
  it('returns 404 for a counting that does not exist', async () => {
    const res = await DELETE(req(), { params: { id: '999999' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-integer id instead of throwing', async () => {
    const res = await DELETE(req(), { params: { id: 'abc' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 and does not delete a counting that belongs to a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const [counting] = await db.insert(countings).values({ storeId: otherStoreId, name: 'Outra loja', prefixLengthUsed: 7, status: 'active' }).returning();
    const res = await DELETE(req(), { params: { id: String(counting.id) } });
    expect(res.status).toBe(404);
    const remaining = await db.select().from(countings).where(eq(countings.id, counting.id));
    expect(remaining).toHaveLength(1);
  });

  it('deletes a counting along with its boxes and scans', async () => {
    const [counting] = await db.insert(countings).values({ storeId, name: 'Teste', prefixLengthUsed: 7, status: 'active' }).returning();
    await recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P');
    await recordScan(db, counting.id, '7899999000011', 'OUTRO-SKU');

    const res = await DELETE(req(), { params: { id: String(counting.id) } });
    expect(res.status).toBe(200);

    const remainingCounting = await db.select().from(countings).where(eq(countings.id, counting.id));
    const remainingBoxes = await db.select().from(boxes).where(eq(boxes.countingId, counting.id));
    expect(remainingCounting).toHaveLength(0);
    expect(remainingBoxes).toHaveLength(0);

    const allScans = await db.select().from(scans);
    expect(allScans).toHaveLength(0);
  });

  it('does not affect other countings when deleting one', async () => {
    const [keep] = await db.insert(countings).values({ storeId, name: 'Manter', prefixLengthUsed: 7, status: 'active' }).returning();
    const [remove] = await db.insert(countings).values({ storeId, name: 'Remover', prefixLengthUsed: 7, status: 'active' }).returning();
    await recordScan(db, keep.id, '7891234000011', 'CUECA-SLIP-P');
    await recordScan(db, remove.id, '7899999000011', 'OUTRO-SKU');

    await DELETE(req(), { params: { id: String(remove.id) } });

    const res = await GET(req(), { params: { id: String(keep.id) } });
    const data = await res.json();
    expect(data.grandTotal).toBe(1);
  });
});
```

- [ ] **Step 3: Reescrever `app/api/countings/[id]/scan/route.test.ts`**

```ts
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { countings } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { POST } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

async function createActiveCounting(overrideStoreId = storeId) {
  const [row] = await db.insert(countings).values({ storeId: overrideStoreId, name: 'Teste', prefixLengthUsed: 7, status: 'active' }).returning();
  return row;
}

function postReq(body: unknown) {
  return storeRequest('http://localhost', storeId, { method: 'POST', body: JSON.stringify(body) });
}

describe('/api/countings/:id/scan', () => {
  it('returns 422 sku_required for a barcode with no linked SKU, recording nothing', async () => {
    const counting = await createActiveCounting();
    const res = await POST(postReq({ barcode: '7891234000011' }), { params: { id: String(counting.id) } });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toBe('sku_required');
  });

  it('records a scan and returns the box hit when a SKU is provided', async () => {
    const counting = await createActiveCounting();
    const res = await POST(postReq({ barcode: '7891234000011', sku: 'CUECA-SLIP-P' }), { params: { id: String(counting.id) } });
    const data = await res.json();
    expect(data.duplicate).toBe(false);
    expect(data.box.boxNumber).toBe(1);
    expect(data.box.sku).toBe('CUECA-SLIP-P');
  });

  it('returns 400 for an invalid barcode', async () => {
    const counting = await createActiveCounting();
    const res = await POST(postReq({ barcode: '12' }), { params: { id: String(counting.id) } });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a counting that does not exist', async () => {
    const res = await POST(postReq({ barcode: '7891234000011' }), { params: { id: '999999' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a counting that belongs to a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const counting = await createActiveCounting(otherStoreId);
    const res = await POST(postReq({ barcode: '7891234000011', sku: 'X' }), { params: { id: String(counting.id) } });
    expect(res.status).toBe(404);
  });

  it('returns 409 when scanning into a finished counting', async () => {
    const counting = await createActiveCounting();
    await db.update(countings).set({ status: 'finished' }).where(eq(countings.id, counting.id));
    const res = await POST(postReq({ barcode: '7891234000011', sku: 'CUECA-SLIP-P' }), { params: { id: String(counting.id) } });
    expect(res.status).toBe(409);
  });

  it('returns 404 for a non-integer id instead of throwing', async () => {
    const res = await POST(postReq({ barcode: '7891234000011' }), { params: { id: 'abc' } });
    expect(res.status).toBe(404);
  });

  it('returns 400 invalid_json when the body is malformed', async () => {
    const counting = await createActiveCounting();
    const res = await POST(storeRequest('http://localhost', storeId, { method: 'POST', body: '{not json' }), {
      params: { id: String(counting.id) },
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_json');
  });

  it('accepts an original scannedAt time and uses it for dedupe instead of the request wall-clock time', async () => {
    const counting = await createActiveCounting();
    const t1 = new Date('2026-01-01T10:00:00Z').toISOString();
    const t2 = new Date('2026-01-01T10:00:02Z').toISOString();

    const res1 = await POST(postReq({ barcode: '7891234000011', sku: 'CUECA-SLIP-P', scannedAt: t1 }), {
      params: { id: String(counting.id) },
    });
    const data1 = await res1.json();
    expect(data1.duplicate).toBe(false);

    const res2 = await POST(postReq({ barcode: '7891234000011', scannedAt: t2 }), { params: { id: String(counting.id) } });
    const data2 = await res2.json();
    expect(data2.duplicate).toBe(false);
    expect(data2.box.total).toBe(2);
  });
});
```

- [ ] **Step 4: Reescrever `app/api/countings/[id]/finish/route.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { countings } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { POST } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

function req() {
  return storeRequest('http://localhost', storeId, { method: 'POST' });
}

describe('/api/countings/:id/finish', () => {
  it('marks the counting as finished', async () => {
    const [counting] = await db.insert(countings).values({ storeId, name: 'Teste', prefixLengthUsed: 7, status: 'active' }).returning();
    const res = await POST(req(), { params: { id: String(counting.id) } });
    const data = await res.json();
    expect(data.counting.status).toBe('finished');
    expect(data.counting.finishedAt).not.toBeNull();
  });

  it('allows finishing a counting with zero scans', async () => {
    const [counting] = await db.insert(countings).values({ storeId, name: 'Vazia', prefixLengthUsed: 7, status: 'active' }).returning();
    const res = await POST(req(), { params: { id: String(counting.id) } });
    expect(res.status).toBe(200);
  });

  it('returns 404 for a counting that does not exist', async () => {
    const res = await POST(req(), { params: { id: '999999' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-integer id instead of throwing', async () => {
    const res = await POST(req(), { params: { id: 'abc' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a counting that belongs to a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const [counting] = await db.insert(countings).values({ storeId: otherStoreId, name: 'Outra loja', prefixLengthUsed: 7, status: 'active' }).returning();
    const res = await POST(req(), { params: { id: String(counting.id) } });
    expect(res.status).toBe(404);
  });

  it('does not overwrite finishedAt when finish is called again on an already-finished counting', async () => {
    const [counting] = await db.insert(countings).values({ storeId, name: 'Teste', prefixLengthUsed: 7, status: 'active' }).returning();
    const first = await POST(req(), { params: { id: String(counting.id) } });
    const firstData = await first.json();

    const second = await POST(req(), { params: { id: String(counting.id) } });
    expect(second.status).toBe(200);
    const secondData = await second.json();

    expect(secondData.counting.status).toBe('finished');
    expect(secondData.counting.finishedAt).toBe(firstData.counting.finishedAt);
  });
});
```

- [ ] **Step 5: Reescrever `app/api/countings/import-xml/route.test.ts`**

Troque a linha `beforeEach(resetDb);` e a chamada `POST(new Request(...))` conforme abaixo — mantenha `sampleXml()` como está. Substitua o topo do arquivo e cada chamada `POST(...)`:

```ts
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { countings, invoiceItems, skus } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { POST } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

function postReq(body: unknown) {
  return storeRequest('http://localhost', storeId, { method: 'POST', body: JSON.stringify(body) });
}

function sampleXml(nNF = '1001') {
  return `<?xml version="1.0"?>
  <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <infNFe Id="NFe123" versao="4.00">
        <ide><nNF>${nNF}</nNF><serie>1</serie></ide>
        <emit><xNome>Fornecedor Teste</xNome></emit>
        <det nItem="1">
          <prod>
            <cProd>SKU-001</cProd>
            <cEAN>7891234000011</cEAN>
            <xProd>Produto A</xProd>
            <qCom>3.0000</qCom>
          </prod>
        </det>
        <det nItem="2">
          <prod>
            <cProd>SKU-002</cProd>
            <cEAN>7891234000028</cEAN>
            <xProd>Produto B</xProd>
            <qCom>6.0000</qCom>
          </prod>
        </det>
      </infNFe>
    </NFe>
  </nfeProc>`;
}

describe('/api/countings/import-xml', () => {
  it('creates an xml-sourced counting with invoice items and updates the products catalog', async () => {
    const res = await POST(postReq({ xml: sampleXml() }));
    expect(res.status).toBe(201);
```

O resto do arquivo (a partir daqui) você já conhece pelo original — mantenha cada teste igual, só trocando toda ocorrência de `new Request('http://localhost', { method: 'POST', body: JSON.stringify(BODY) })` por `postReq(BODY)`. Adicione também este teste novo ao fim do `describe`, comprovando isolamento por loja:

```ts

  it('does not update a product registered under the same barcode in a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await db.insert(skus).values({ storeId: otherStoreId, barcode: '7891234000011', sku: 'ANTIGO', name: 'Outra loja' });

    await POST(postReq({ xml: sampleXml() }));

    const otherStoreRow = await db.select().from(skus).where(and(eq(skus.storeId, otherStoreId), eq(skus.barcode, '7891234000011')));
    expect(otherStoreRow[0]).toMatchObject({ sku: 'ANTIGO', name: 'Outra loja' });

    const currentStoreRow = await db.select().from(skus).where(and(eq(skus.storeId, storeId), eq(skus.barcode, '7891234000011')));
    expect(currentStoreRow[0]).toMatchObject({ sku: 'SKU-001', name: 'Produto A' });
  });
});
```

(Repare que este novo teste fecha o `describe` — remova o `});` duplicado que sobrar se você colar por cima do fechamento original.)

- [ ] **Step 6: Rodar e confirmar que os cinco arquivos falham**

Run: `npx vitest run app/api/countings`
Expected: FAIL.

- [ ] **Step 7: Reescrever `app/api/countings/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { countings } from '@/db/schema';
import { getPrefixLength } from '@/lib/getPrefixLength';
import { getRequireSku } from '@/lib/getRequireSku';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function GET(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const q = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE),
  );

  const conditions = [eq(countings.storeId, storeId)];
  if (status === 'active' || status === 'finished') conditions.push(eq(countings.status, status));
  if (q) conditions.push(ilike(countings.name, `%${q}%`));
  const where = and(...conditions);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(countings).where(where);
  const rows = await db
    .select()
    .from(countings)
    .where(where)
    .orderBy(desc(countings.startedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return NextResponse.json({ countings: rows, total: count, page, pageSize });
}

export async function POST(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const name = String(body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  }
  const prefixLength = await getPrefixLength(db);
  const requireSku = await getRequireSku(db);
  const [row] = await db
    .insert(countings)
    .values({ storeId, name, prefixLengthUsed: prefixLength, requireSkuUsed: requireSku, status: 'active' })
    .returning();
  return NextResponse.json({ counting: row }, { status: 201 });
}
```

- [ ] **Step 8: Reescrever `app/api/countings/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { boxes, countings, groups, invoiceItems, scans } from '@/db/schema';
import { resolveGroupName } from '@/lib/groupMatch';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const countingId = Number(params.id);
  if (!Number.isInteger(countingId)) {
    return NextResponse.json({ error: 'counting_not_found' }, { status: 404 });
  }
  const storeId = getStoreIdFromRequest(req);
  const countingRows = await db
    .select()
    .from(countings)
    .where(and(eq(countings.id, countingId), eq(countings.storeId, storeId)))
    .limit(1);
  const counting = countingRows[0];
  if (!counting) {
    return NextResponse.json({ error: 'counting_not_found' }, { status: 404 });
  }

  const boxRows = await db.select().from(boxes).where(eq(boxes.countingId, countingId)).orderBy(asc(boxes.boxNumber));
  const allGroups = await db.select().from(groups).where(eq(groups.storeId, counting.storeId));

  const boxesWithTotals = await Promise.all(
    boxRows.map(async (box) => {
      const skuResult = await db.execute(sql`
        SELECT sc.barcode AS barcode, s.sku AS sku, s.name AS name, COUNT(*)::int AS total
        FROM scans sc
        LEFT JOIN skus s ON s.barcode = sc.barcode AND s.store_id = ${counting.storeId}
        WHERE sc.box_id = ${box.id}
        GROUP BY sc.barcode, s.sku, s.name
        ORDER BY s.name, sc.barcode
      `);
      const skuBreakdown = (skuResult as any).rows as {
        barcode: string;
        sku: string | null;
        name: string | null;
        total: number;
      }[];
      const total = skuBreakdown.reduce((sum, s) => sum + s.total, 0);
      return {
        boxNumber: box.boxNumber,
        prefix: box.prefix,
        groupName: resolveGroupName(box.prefix, allGroups),
        total,
        skuBreakdown,
      };
    }),
  );

  const grandTotal = boxesWithTotals.reduce((sum, b) => sum + b.total, 0);

  let invoiceCheck: {
    barcode: string;
    sku: string | null;
    name: string | null;
    expectedQty: number;
    countedQty: number;
  }[] | null = null;

  if (counting.source === 'xml') {
    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.countingId, countingId));
    invoiceCheck = await Promise.all(
      items.map(async (item) => {
        const countedResult = await db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM scans sc
          JOIN boxes b ON b.id = sc.box_id
          WHERE b.counting_id = ${countingId} AND sc.barcode = ${item.barcode}
        `);
        const countedQty = ((countedResult as any).rows[0]?.total as number) ?? 0;
        return {
          barcode: item.barcode,
          sku: item.sku,
          name: item.name,
          expectedQty: item.expectedQty,
          countedQty,
        };
      }),
    );
    invoiceCheck.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }

  return NextResponse.json({ counting, boxes: boxesWithTotals, grandTotal, invoiceCheck });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const countingId = Number(params.id);
  if (!Number.isInteger(countingId)) {
    return NextResponse.json({ error: 'counting_not_found' }, { status: 404 });
  }
  const storeId = getStoreIdFromRequest(req);

  const countingRows = await db
    .select()
    .from(countings)
    .where(and(eq(countings.id, countingId), eq(countings.storeId, storeId)))
    .limit(1);
  if (!countingRows[0]) {
    return NextResponse.json({ error: 'counting_not_found' }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    const boxRows = await tx.select({ id: boxes.id }).from(boxes).where(eq(boxes.countingId, countingId));
    const boxIds = boxRows.map((b) => b.id);
    if (boxIds.length > 0) {
      await tx.delete(scans).where(inArray(scans.boxId, boxIds));
    }
    await tx.delete(invoiceItems).where(eq(invoiceItems.countingId, countingId));
    await tx.delete(boxes).where(eq(boxes.countingId, countingId));
    await tx.delete(countings).where(eq(countings.id, countingId));
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 9: Reescrever `app/api/countings/[id]/scan/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { countings } from '@/db/schema';
import {
  CountingNotActiveError,
  InvalidBarcodeError,
  SkuRequiredError,
  recordScan,
} from '@/lib/scanCounting';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const countingId = Number(params.id);
  if (!Number.isInteger(countingId)) {
    return NextResponse.json({ error: 'counting_not_found' }, { status: 404 });
  }
  const storeId = getStoreIdFromRequest(req);
  const countingRows = await db
    .select({ id: countings.id })
    .from(countings)
    .where(and(eq(countings.id, countingId), eq(countings.storeId, storeId)))
    .limit(1);
  if (!countingRows[0]) {
    return NextResponse.json({ error: 'counting_not_found' }, { status: 404 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const barcode = String(body.barcode ?? '');
  const sku = typeof body.sku === 'string' ? body.sku : undefined;
  const scannedAt = typeof body.scannedAt === 'string' ? new Date(body.scannedAt) : undefined;

  try {
    const outcome = await recordScan(db, countingId, barcode, sku, scannedAt);
    return NextResponse.json(outcome);
  } catch (err) {
    if (err instanceof InvalidBarcodeError) {
      return NextResponse.json({ error: 'invalid_barcode' }, { status: 400 });
    }
    if (err instanceof CountingNotActiveError) {
      return NextResponse.json({ error: 'counting_not_active' }, { status: 409 });
    }
    if (err instanceof SkuRequiredError) {
      return NextResponse.json({ error: 'sku_required' }, { status: 422 });
    }
    throw err;
  }
}
```

Note: removi o `CountingNotFoundError` do bloco `catch` (não é mais lançado nesse caminho, já que a rota checa a loja antes de chamar `recordScan` — `recordScan` só lançaria `CountingNotFoundError` se a contagem tivesse sumido entre a checagem e a chamada, uma corrida improvável que não precisa de tratamento especial aqui). Se preferir manter o import e o `catch` por defesa, não há problema — só garanta que o import de `CountingNotFoundError` exista se você mantiver essa branch.

- [ ] **Step 10: Reescrever `app/api/countings/[id]/finish/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { countings } from '@/db/schema';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const countingId = Number(params.id);
  if (!Number.isInteger(countingId)) {
    return NextResponse.json({ error: 'counting_not_found' }, { status: 404 });
  }
  const storeId = getStoreIdFromRequest(req);

  const [row] = await db
    .update(countings)
    .set({ status: 'finished', finishedAt: new Date() })
    .where(and(eq(countings.id, countingId), eq(countings.storeId, storeId), eq(countings.status, 'active')))
    .returning();
  if (row) {
    return NextResponse.json({ counting: row });
  }

  // No row updated: either the counting doesn't exist (or belongs to
  // another store), or it was already finished (re-call). Distinguish the
  // two rather than blindly overwriting finishedAt on an already-finished
  // counting.
  const existingRows = await db
    .select()
    .from(countings)
    .where(and(eq(countings.id, countingId), eq(countings.storeId, storeId)))
    .limit(1);
  const existing = existingRows[0];
  if (!existing) {
    return NextResponse.json({ error: 'counting_not_found' }, { status: 404 });
  }
  return NextResponse.json({ counting: existing });
}
```

- [ ] **Step 11: Reescrever `app/api/countings/import-xml/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { countings, invoiceItems, skus } from '@/db/schema';
import { getPrefixLength } from '@/lib/getPrefixLength';
import { getRequireSku } from '@/lib/getRequireSku';
import { InvalidNfeXmlError, parseNfeXml } from '@/lib/parseNfeXml';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const xml = typeof body.xml === 'string' ? body.xml : '';
  if (!xml.trim()) {
    return NextResponse.json({ error: 'invalid_xml' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseNfeXml(xml);
  } catch (err) {
    if (err instanceof InvalidNfeXmlError) {
      return NextResponse.json({ error: 'invalid_xml', message: err.message }, { status: 400 });
    }
    throw err;
  }

  const name =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : `NF ${parsed.invoiceNumber}${parsed.supplierName ? ' — ' + parsed.supplierName : ''}`;

  const prefixLength = await getPrefixLength(db);
  const requireSku = await getRequireSku(db);

  // Keep the products catalog (skus table) up to date from the invoice, the
  // same way the CSV import does, so scans of these barcodes resolve to a
  // SKU/name without asking the person to type it in mid-count.
  let productsCreated = 0;
  let productsUpdated = 0;
  for (const item of parsed.items) {
    const existing = await db.select().from(skus).where(and(eq(skus.storeId, storeId), eq(skus.barcode, item.barcode))).limit(1);
    if (existing[0]) {
      await db
        .update(skus)
        .set({ sku: item.sku, name: item.name })
        .where(and(eq(skus.storeId, storeId), eq(skus.barcode, item.barcode)));
      productsUpdated++;
    } else {
      await db.insert(skus).values({ storeId, barcode: item.barcode, sku: item.sku, name: item.name });
      productsCreated++;
    }
  }

  const [counting] = await db
    .insert(countings)
    .values({
      storeId,
      name,
      prefixLengthUsed: prefixLength,
      requireSkuUsed: requireSku,
      status: 'active',
      source: 'xml',
      invoiceNumber: parsed.invoiceNumber,
      supplierName: parsed.supplierName,
    })
    .returning();

  if (parsed.items.length > 0) {
    await db.insert(invoiceItems).values(
      parsed.items.map((item) => ({
        countingId: counting.id,
        barcode: item.barcode,
        sku: item.sku,
        name: item.name,
        expectedQty: item.quantity,
      })),
    );
  }

  return NextResponse.json(
    {
      counting,
      itemsImported: parsed.items.length,
      productsCreated,
      productsUpdated,
      itemErrors: parsed.errors,
    },
    { status: 201 },
  );
}
```

- [ ] **Step 12: Rodar e confirmar que passa**

Run: `npx vitest run app/api/countings`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add app/api/countings
git commit -m "feat: scope Countings routes by store"
```

---

### Task 11: `app/api/dynamicConfig.test.ts` e checagem manual das novas rotas

**Files:**
- No modification expected — apenas verificação.

- [ ] **Step 1: Rodar o teste de configuração dinâmica**

Run: `npx vitest run app/api/dynamicConfig.test.ts`
Expected: PASS — todas as rotas criadas neste plano (`app/api/stores/route.ts`) já incluem `export const dynamic = 'force-dynamic';` desde que foram escritas na Task 3. Se falhar, volte na Task 3 e confira essa linha.

- [ ] **Step 2: Nenhum commit necessário nesta tarefa** (é só uma checagem).

---

### Task 12: Suite completa, checagem manual no navegador e documentação

**Files:**
- Modify: `README.md`

**Interfaces:** nenhuma nova.

- [ ] **Step 1: Rodar a suite inteira**

Run: `npm test`
Expected: PASS — todos os arquivos de teste do projeto, incluindo os não tocados por este plano (ex: `lib/prefix.test.ts`, `lib/dedupe.test.ts`, `lib/parseNfeXml.test.ts`), continuam passando.

Se algo falhar, é sinal de que algum arquivo listado nas tarefas anteriores ficou com uma chamada antiga (`new Request(...)` sem cookie, ou um `db.insert` sem `storeId`) que passou despercebida — corrija antes de prosseguir.

- [ ] **Step 2: Checagem manual no navegador**

Run: `npm run dev`, depois abra `http://localhost:3000` no navegador.

Confirme manualmente:
1. Acessar a raiz sem cookie algum (aba anônima) redireciona para `/loja`.
2. `/loja` mostra "COXIM-MS" e "CAMPO GRANDE-MS" (via CSS `uppercase` em cima de "Coxim-MS"/"Campo Grande-MS").
3. Escolher "Coxim-MS" volta pra `/` e mostra as contagens/produtos/grupos que já existiam antes desta mudança (migrados para essa loja).
4. Escolher "Trocar loja" no menu limpa a seleção e volta pra `/loja`; escolher "Campo Grande-MS" mostra listas vazias de Contagens/Produtos/Grupos (loja nova, sem dados ainda).
5. Criar um produto/grupo/contagem em Campo Grande-MS e confirmar que não aparece ao trocar de volta pra Coxim-MS, e vice-versa.

- [ ] **Step 3: Atualizar o README**

Em `README.md`, logo após a seção "## Rodando os testes" e antes de "## Deploy", adicione:

```markdown
## Lojas (Coxim-MS e Campo Grande-MS)

O sistema roda para duas lojas físicas. Ao abrir qualquer página sem uma loja escolhida, o usuário é redirecionado para `/loja` — a escolha fica salva num cookie `store_id` no navegador (sem expiração curta), e "Trocar loja" no menu limpa esse cookie. Contagens, Produtos (SKUs) e Grupos são independentes por loja; Configurações (prefixo de grupo, exigir SKU) é global para as duas.

As duas lojas nascem via seed na migração `db/migrations/0004_*.sql` — abrir uma terceira loja hoje é um `INSERT` manual na tabela `stores`, sem UI de administração (fora do escopo atual).
```

E, na seção "## Limitações conhecidas", adicione um item:

```markdown
- O `middleware.ts` que garante a seleção de loja só valida que o cookie `store_id` é numérico — ele roda no runtime Edge do Next.js, que não suporta o driver `pg` usado pelo projeto, então não consulta o banco para confirmar que a loja ainda existe. Como não há UI para remover uma loja, isso não é um problema na prática hoje.
```

- [ ] **Step 4: Commit final**

```bash
git add README.md
git commit -m "docs: document store scoping and its middleware runtime limitation"
```
