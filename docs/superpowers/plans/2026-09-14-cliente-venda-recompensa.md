# Cadastro de cliente e lançamento de venda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastro de cliente (nome + telefone) e lançamento de venda (cliente + data + valor) por loja, atrás de um PIN por loja, com uma página `/recompensas` (busca/seleciona/cadastra cliente, lança venda, lista vendas) e `/recompensas/clientes` (gerencia clientes).

**Architecture:** Duas tabelas novas (`customers`, `sales`), escopadas por loja como tudo no sub-projeto 1. Um cookie `sale_pin_ok` (perene, valor = id da loja) libera as rotas de API de clientes/vendas depois de `POST /api/sale-pin/verify` bater com a variável de ambiente do PIN daquela loja. Um componente `PinGate` reusa essa lógica nas duas páginas novas. Um componente `Table` genérico (striped, responsivo) é usado por toda grade nova.

**Tech Stack:** Next.js 14 (App Router), Drizzle ORM + Postgres, Vitest (testes de integração reais, sem mocks de banco).

**Spec:** `docs/superpowers/specs/2026-09-14-cliente-venda-recompensa-design.md`

## Global Constraints

- Toda rota em `app/api/**/route.ts` **precisa** exportar `export const dynamic = 'force-dynamic';` (verificado por `app/api/dynamicConfig.test.ts`).
- Todo formulário de criação usa um `useRef` booleano (`savingRef`) checado no início do submit, além do `useState` de loading — previne duplo-submit por clique duplo.
- Toda grade (lista tabular) desta feature usa o componente `components/ui/Table.tsx` (Task 4): responsivo (scroll horizontal em telas estreitas), paginado (`components/ui/Pagination.tsx`, já existente), linhas com fundo alternado (striped).
- Toda rota de `/api/customers*` e `/api/sales*` (exceto `POST /api/sale-pin/verify`) exige, nessa ordem: id numérico válido (se a rota tiver `:id`) → `getStoreIdFromRequest` → `isSalePinUnlocked` → validação do corpo → operação no banco. 401 `{ error: 'sale_pin_required' }` se o PIN não estiver destravado pra loja atual; 404 pra recurso de outra loja ou inexistente.
- `sale_pin_ok` é um cookie perene (`max-age=31536000; samesite=lax`), mesmo padrão do cookie `store_id`.

---

### Task 1: Schema, migração e `resetDb`

**Files:**
- Modify: `db/schema.ts`
- Create: `db/migrations/0005_<nome-gerado>.sql` (gerado pelo `drizzle-kit generate`, sem edição manual — diferente da Task 1 do sub-projeto 1, aqui são tabelas novas, sem dado existente pra migrar)
- Modify: `tests/resetDb.ts`

**Interfaces:**
- Consumes: `stores` de `db/schema.ts` (já existe).
- Produces: `customers` (`id`, `storeId`, `name`, `phone`, `createdAt`) e `sales` (`id`, `storeId`, `customerId`, `saleDate`, `valueCents`, `createdAt`) exportadas de `db/schema.ts`.

- [ ] **Step 1: Editar `db/schema.ts`**

Troque a primeira linha (import) por:

```ts
import { boolean, date, index, integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
```

E adicione ao final do arquivo (depois de `invoiceItems`):

```ts

export const customers = pgTable(
  'customers',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id').notNull().references(() => stores.id),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index('customers_store_id_idx').on(table.storeId),
  }),
);

export const sales = pgTable(
  'sales',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id').notNull().references(() => stores.id),
    customerId: integer('customer_id').notNull().references(() => customers.id),
    saleDate: date('sale_date', { mode: 'string' }).notNull(),
    valueCents: integer('value_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index('sales_store_id_idx').on(table.storeId),
  }),
);
```

- [ ] **Step 2: Gerar e aplicar a migração**

Run: `npm run db:generate`

Isso cria `db/migrations/0005_<nome-aleatório>.sql` com dois `CREATE TABLE` (mais os índices e FKs) — **diferente da migração do sub-projeto 1**, aqui não há dado existente em `customers`/`sales` pra migrar, então o SQL gerado automaticamente já é seguro de usar como está. Não edite esse arquivo.

Run: `npm run db:migrate`
Expected: `Migrations applied`, sem erro (aplica contra o banco de dev local).

- [ ] **Step 3: Atualizar `tests/resetDb.ts`**

Substitua o arquivo inteiro por:

```ts
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

export async function resetDb() {
  await db.execute(sql`TRUNCATE TABLE scans, boxes, countings, groups, settings, skus, customers, sales RESTART IDENTITY CASCADE`);
}
```

- [ ] **Step 4: Rodar o teste de schema existente pra garantir que nada quebrou**

Run: `npx vitest run db/schema.test.ts`
Expected: PASS (8 testes, inalterados por esta tarefa).

- [ ] **Step 5: Commit**

```bash
git add db/schema.ts db/migrations tests/resetDb.ts
git commit -m "feat: add customers and sales tables scoped by store"
```

---

### Task 2: `lib/salePin.ts` e helper de teste

**Files:**
- Create: `lib/salePin.ts`
- Create: `lib/salePin.test.ts`
- Create: `tests/testSalePin.ts`

**Interfaces:**
- Consumes: `storeRequest` de `tests/testStores.ts` (já existe, assinatura `storeRequest(url: string, storeId: number, init?: RequestInit): Request`).
- Produces: `SALE_PIN_COOKIE_NAME` (constante `'sale_pin_ok'`), `getSalePinEnvVarName(slug: string): string`, `isSalePinUnlocked(req: Request, storeId: number): boolean` — todos exportados de `lib/salePin.ts`. `unlockedRequest(url: string, storeId: number, init?: RequestInit): Request` exportado de `tests/testSalePin.ts`.

- [ ] **Step 1: Escrever `lib/salePin.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { getSalePinEnvVarName, isSalePinUnlocked } from './salePin';

describe('getSalePinEnvVarName', () => {
  it('derives the env var name from a store slug', () => {
    expect(getSalePinEnvVarName('coxim-ms')).toBe('SALE_PIN_COXIM_MS');
    expect(getSalePinEnvVarName('campo-grande-ms')).toBe('SALE_PIN_CAMPO_GRANDE_MS');
  });
});

describe('isSalePinUnlocked', () => {
  function reqWithCookie(cookie: string | null) {
    const headers = new Headers();
    if (cookie !== null) headers.set('cookie', cookie);
    return new Request('http://localhost', { headers });
  }

  it('returns true when sale_pin_ok matches the given storeId', () => {
    expect(isSalePinUnlocked(reqWithCookie('sale_pin_ok=1'), 1)).toBe(true);
  });

  it('returns false when sale_pin_ok belongs to a different store', () => {
    expect(isSalePinUnlocked(reqWithCookie('sale_pin_ok=2'), 1)).toBe(false);
  });

  it('returns false when there is no sale_pin_ok cookie', () => {
    expect(isSalePinUnlocked(reqWithCookie('store_id=1'), 1)).toBe(false);
  });

  it('returns false when there is no cookie header at all', () => {
    expect(isSalePinUnlocked(reqWithCookie(null), 1)).toBe(false);
  });

  it('finds sale_pin_ok among other cookies', () => {
    expect(isSalePinUnlocked(reqWithCookie('store_id=1; sale_pin_ok=1; other=x'), 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/salePin.test.ts`
Expected: FAIL — módulo `./salePin` não existe.

- [ ] **Step 3: Implementar `lib/salePin.ts`**

```ts
export const SALE_PIN_COOKIE_NAME = 'sale_pin_ok';

export function getSalePinEnvVarName(slug: string): string {
  return `SALE_PIN_${slug.toUpperCase().replace(/-/g, '_')}`;
}

export function isSalePinUnlocked(req: Request, storeId: number): boolean {
  const cookieHeader = req.headers.get('cookie') ?? '';
  for (const part of cookieHeader.split(';')) {
    const [key, value] = part.trim().split('=');
    if (key === SALE_PIN_COOKIE_NAME) {
      return Number(value) === storeId;
    }
  }
  return false;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/salePin.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Criar `tests/testSalePin.ts`**

```ts
import { storeRequest } from './testStores';

export function unlockedRequest(url: string, storeId: number, init: RequestInit = {}): Request {
  const withStore = storeRequest(url, storeId, init);
  const existingCookie = withStore.headers.get('cookie') ?? '';
  const headers = new Headers(withStore.headers);
  headers.set('cookie', `${existingCookie}; sale_pin_ok=${storeId}`);
  return new Request(url, { ...init, headers });
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/salePin.ts lib/salePin.test.ts tests/testSalePin.ts
git commit -m "feat: add sale PIN cookie helper"
```

---

### Task 3: `lib/currency.ts`

**Files:**
- Create: `lib/currency.ts`
- Create: `lib/currency.test.ts`

**Interfaces:**
- Produces: `formatCentsAsBRL(cents: number): string`.

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, expect, it } from 'vitest';
import { formatCentsAsBRL } from './currency';

describe('formatCentsAsBRL', () => {
  it('formats cents as a BRL currency string with two decimals', () => {
    expect(formatCentsAsBRL(4590)).toBe('R$ 45,90');
  });

  it('formats a value under one real', () => {
    expect(formatCentsAsBRL(50)).toBe('R$ 0,50');
  });

  it('adds a thousands separator for large values', () => {
    expect(formatCentsAsBRL(123456789)).toBe('R$ 1.234.567,89');
  });

  it('formats zero', () => {
    expect(formatCentsAsBRL(0)).toBe('R$ 0,00');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/currency.test.ts`
Expected: FAIL — módulo `./currency` não existe.

- [ ] **Step 3: Implementar `lib/currency.ts`**

Implementação manual (sem depender de `toLocaleString`, que varia conforme os dados de locale/ICU disponíveis no ambiente onde o código roda — assim o resultado é determinístico em qualquer ambiente):

```ts
export function formatCentsAsBRL(cents: number): string {
  const value = (cents / 100).toFixed(2).replace('.', ',');
  const [intPart, decPart] = value.split(',');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${withThousands},${decPart}`;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/currency.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/currency.ts lib/currency.test.ts
git commit -m "feat: add formatCentsAsBRL currency formatter"
```

---

### Task 4: `components/ui/Table.tsx` — grade genérica striped/responsiva

**Files:**
- Create: `components/ui/Table.tsx`
- Create: `components/ui/Table.test.tsx`

**Interfaces:**
- Produces: `Table<T extends { id: number | string }>({ columns, rows, emptyMessage }: { columns: { header: string; render: (row: T) => React.ReactNode; className?: string }[]; rows: T[]; emptyMessage: string })` — componente React exportado.

- [ ] **Step 1: Escrever o teste**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table } from './Table';

interface Row {
  id: number;
  name: string;
  age: number;
}

const columns = [
  { header: 'Nome', render: (r: Row) => r.name },
  { header: 'Idade', render: (r: Row) => String(r.age) },
];

describe('Table', () => {
  it('renders a header and a row per item', () => {
    render(<Table columns={columns} rows={[{ id: 1, name: 'Ana', age: 30 }]} emptyMessage="Vazio" />);
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByText('Idade')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('shows the empty message when there are no rows', () => {
    render(<Table columns={columns} rows={[]} emptyMessage="Nenhum registro." />);
    expect(screen.getByText('Nenhum registro.')).toBeInTheDocument();
  });

  it('alternates row background classes for a striped look', () => {
    const { container } = render(
      <Table
        columns={columns}
        rows={[
          { id: 1, name: 'Ana', age: 30 },
          { id: 2, name: 'Bia', age: 25 },
        ]}
        emptyMessage="Vazio"
      />,
    );
    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].className).toContain('bg-paper');
    expect(rows[1].className).toContain('bg-canvas');
  });

  it('wraps the table in a horizontally scrollable container for narrow screens', () => {
    const { container } = render(<Table columns={columns} rows={[{ id: 1, name: 'Ana', age: 30 }]} emptyMessage="Vazio" />);
    expect(container.querySelector('.overflow-x-auto')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run components/ui/Table.test.tsx`
Expected: FAIL — módulo `./Table` não existe.

- [ ] **Step 3: Implementar `components/ui/Table.tsx`**

```tsx
interface Column<T> {
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export function Table<T extends { id: number | string }>({
  columns,
  rows,
  emptyMessage,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="text-lg text-gray-500">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200">
      <table className="w-full min-w-[480px] border-collapse text-left">
        <thead>
          <tr className="bg-canvas">
            {columns.map((col) => (
              <th key={col.header} className={`px-4 py-3 text-sm font-semibold text-gray-600 ${col.className ?? ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} className={i % 2 === 0 ? 'bg-paper' : 'bg-canvas'}>
              {columns.map((col) => (
                <td key={col.header} className={`px-4 py-3 text-base ${col.className ?? ''}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run components/ui/Table.test.tsx`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add components/ui/Table.tsx components/ui/Table.test.tsx
git commit -m "feat: add reusable striped/paginated Table component"
```

---

### Task 5: `components/PinGate.tsx`

**Files:**
- Create: `components/PinGate.tsx`
- Create: `components/PinGate.test.tsx`

**Interfaces:**
- Consumes: `Button` de `components/ui/Button.tsx` (já existe, `variant` default `'primary'`).
- Produces: `PinGate({ children }: { children: React.ReactNode })` — componente React exportado. Renderiza `children` quando o cookie `sale_pin_ok` bate com o cookie `store_id` atual; senão, mostra um formulário de PIN.

- [ ] **Step 1: Escrever o teste**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PinGate } from './PinGate';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'store_id=; path=/; max-age=0';
  document.cookie = 'sale_pin_ok=; path=/; max-age=0';
});

describe('PinGate', () => {
  it('shows the PIN form when not unlocked for the current store', async () => {
    document.cookie = 'store_id=1; path=/';
    render(
      <PinGate>
        <p>Conteúdo protegido</p>
      </PinGate>,
    );
    await waitFor(() => expect(screen.getByPlaceholderText('PIN')).toBeInTheDocument());
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
  });

  it('shows the children directly when already unlocked for the current store', async () => {
    document.cookie = 'store_id=1; path=/';
    document.cookie = 'sale_pin_ok=1; path=/';
    render(
      <PinGate>
        <p>Conteúdo protegido</p>
      </PinGate>,
    );
    await waitFor(() => expect(screen.getByText('Conteúdo protegido')).toBeInTheDocument());
  });

  it('does not unlock when sale_pin_ok belongs to a different store', async () => {
    document.cookie = 'store_id=1; path=/';
    document.cookie = 'sale_pin_ok=2; path=/';
    render(
      <PinGate>
        <p>Conteúdo protegido</p>
      </PinGate>,
    );
    await waitFor(() => expect(screen.getByPlaceholderText('PIN')).toBeInTheDocument());
  });

  it('unlocks after submitting the correct PIN', async () => {
    document.cookie = 'store_id=1; path=/';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
    render(
      <PinGate>
        <p>Conteúdo protegido</p>
      </PinGate>,
    );
    await waitFor(() => expect(screen.getByPlaceholderText('PIN')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(screen.getByText('Conteúdo protegido')).toBeInTheDocument());
    expect(document.cookie).toContain('sale_pin_ok=1');
  });

  it('shows an error when the PIN is incorrect', async () => {
    document.cookie = 'store_id=1; path=/';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid_pin' }) }));
    render(
      <PinGate>
        <p>Conteúdo protegido</p>
      </PinGate>,
    );
    await waitFor(() => expect(screen.getByPlaceholderText('PIN')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('PIN'), { target: { value: 'errado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(screen.getByText('PIN incorreto.')).toBeInTheDocument());
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run components/PinGate.test.tsx`
Expected: FAIL — módulo `./PinGate` não existe.

- [ ] **Step 3: Implementar `components/PinGate.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

function getCookieValue(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=(\\d+)`));
  return match ? match[1] : null;
}

export function PinGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const storeId = getCookieValue('store_id');
    const salePinOk = getCookieValue('sale_pin_ok');
    setUnlocked(storeId !== null && storeId === salePinOk);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/sale-pin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        setError('PIN incorreto.');
        return;
      }
      const storeId = getCookieValue('store_id');
      document.cookie = `sale_pin_ok=${storeId}; path=/; max-age=31536000; samesite=lax`;
      setUnlocked(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (unlocked === null) {
    return null;
  }

  if (!unlocked) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center gap-4 p-4">
        <h1 className="text-2xl font-semibold">Digite o PIN da loja</h1>
        <form onSubmit={submit} className="flex w-full flex-col gap-4">
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            autoFocus
            className="w-full rounded-xl border-2 border-gray-300 px-4 py-4 text-xl placeholder:text-sm"
          />
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Verificando...' : 'Entrar'}
          </Button>
          {error && <p className="text-lg text-red-600">{error}</p>}
        </form>
      </main>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run components/PinGate.test.tsx`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add components/PinGate.tsx components/PinGate.test.tsx
git commit -m "feat: add PinGate component for the rewards PIN lock"
```

---

### Task 6: `POST /api/sale-pin/verify`

**Files:**
- Create: `app/api/sale-pin/verify/route.ts`
- Create: `app/api/sale-pin/verify/route.test.ts`

**Interfaces:**
- Consumes: `getStoreIdFromRequest` de `lib/store.ts`, `getSalePinEnvVarName` de `lib/salePin.ts`, `stores` de `db/schema.ts`, `getTestStoreId`/`storeRequest` de `tests/testStores.ts`.
- Produces: `POST` retornando `{ ok: true }` (200) ou `{ error: 'invalid_pin' }` (401).

- [ ] **Step 1: Escrever o teste**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { POST } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function verifyReq(pin: string, id = storeId) {
  return storeRequest('http://localhost', id, { method: 'POST', body: JSON.stringify({ pin }) });
}

describe('/api/sale-pin/verify', () => {
  it('returns ok when the pin matches the env var for the current store', async () => {
    vi.stubEnv('SALE_PIN_COXIM_MS', '1234');
    const res = await POST(verifyReq('1234'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('returns 401 invalid_pin when the pin does not match', async () => {
    vi.stubEnv('SALE_PIN_COXIM_MS', '1234');
    const res = await POST(verifyReq('0000'));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('invalid_pin');
  });

  it('returns 401 invalid_pin when the store has no pin configured', async () => {
    const res = await POST(verifyReq('anything'));
    expect(res.status).toBe(401);
  });

  it('checks the pin against the correct store — a pin valid for one store does not unlock another', async () => {
    vi.stubEnv('SALE_PIN_COXIM_MS', '1234');
    vi.stubEnv('SALE_PIN_CAMPO_GRANDE_MS', '5678');
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const res = await POST(verifyReq('1234', otherStoreId));
    expect(res.status).toBe(401);
  });

  it('returns 400 invalid_json when the body is malformed', async () => {
    const res = await POST(storeRequest('http://localhost', storeId, { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run app/api/sale-pin/verify/route.test.ts`
Expected: FAIL — módulo `./route` não existe.

- [ ] **Step 3: Implementar a rota**

```ts
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { stores } from '@/db/schema';
import { getSalePinEnvVarName } from '@/lib/salePin';
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
  const pin = String(body.pin ?? '');

  const storeRows = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  const store = storeRows[0];
  if (!store) {
    return NextResponse.json({ error: 'invalid_pin' }, { status: 401 });
  }

  const expectedPin = process.env[getSalePinEnvVarName(store.slug)];
  if (!expectedPin || pin !== expectedPin) {
    return NextResponse.json({ error: 'invalid_pin' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run app/api/sale-pin/verify/route.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add app/api/sale-pin
git commit -m "feat: add POST /api/sale-pin/verify"
```

---

### Task 7: Rotas de Clientes

**Files:**
- Create: `app/api/customers/route.ts`
- Create: `app/api/customers/route.test.ts`
- Create: `app/api/customers/[id]/route.ts`
- Create: `app/api/customers/[id]/route.test.ts`

**Interfaces:**
- Consumes: `getStoreIdFromRequest` (`lib/store.ts`), `isSalePinUnlocked` (`lib/salePin.ts`), `getTestStoreId`/`storeRequest` (`tests/testStores.ts`), `unlockedRequest` (`tests/testSalePin.ts`).
- Produces: `GET`/`POST /api/customers`, `PUT`/`DELETE /api/customers/:id`.

- [ ] **Step 1: Escrever `app/api/customers/route.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { GET, POST } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

function getReq(query = '') {
  return unlockedRequest(`http://localhost/api/customers${query}`, storeId);
}

function postReq(body: unknown) {
  return unlockedRequest('http://localhost/api/customers', storeId, { method: 'POST', body: JSON.stringify(body) });
}

describe('/api/customers', () => {
  it('returns 401 sale_pin_required when the PIN is not unlocked', async () => {
    const res = await GET(storeRequest('http://localhost/api/customers', storeId));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('sale_pin_required');
  });

  it('starts empty', async () => {
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.customers).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('creates a customer', async () => {
    const res = await POST(postReq({ name: 'Ana', phone: '99999-0000' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.customer).toMatchObject({ name: 'Ana', phone: '99999-0000' });
  });

  it('rejects an empty name or phone', async () => {
    const res = await POST(postReq({ name: '', phone: '99999-0000' }));
    expect(res.status).toBe(400);
  });

  it('allows duplicate phone numbers', async () => {
    await POST(postReq({ name: 'Ana', phone: '99999-0000' }));
    const res = await POST(postReq({ name: 'Outra Ana', phone: '99999-0000' }));
    expect(res.status).toBe(201);
  });

  it('filters by a search term across name and phone', async () => {
    await POST(postReq({ name: 'Ana Silva', phone: '99999-0000' }));
    await POST(postReq({ name: 'Bia Souza', phone: '98888-1111' }));

    const byName = await GET(getReq('?q=ana'));
    expect((await byName.json()).customers).toHaveLength(1);

    const byPhone = await GET(getReq('?q=98888'));
    expect((await byPhone.json()).customers).toHaveLength(1);
  });

  it('only lists customers from the current store', async () => {
    await POST(postReq({ name: 'Loja atual', phone: '99999-0000' }));
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await POST(unlockedRequest('http://localhost/api/customers', otherStoreId, { method: 'POST', body: JSON.stringify({ name: 'Outra loja', phone: '1' }) }));

    const res = await GET(getReq());
    const data = await res.json();
    expect(data.customers).toHaveLength(1);
    expect(data.customers[0].name).toBe('Loja atual');
  });

  it('paginates results', async () => {
    for (let i = 1; i <= 3; i++) {
      await POST(postReq({ name: `Cliente ${i}`, phone: String(i) }));
    }
    const res = await GET(getReq('?pageSize=2&page=1'));
    const data = await res.json();
    expect(data.customers).toHaveLength(2);
    expect(data.total).toBe(3);
  });

  it('returns 400 invalid_json when the body is malformed', async () => {
    const res = await POST(unlockedRequest('http://localhost/api/customers', storeId, { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Escrever `app/api/customers/[id]/route.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { customers } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { DELETE, PUT } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

async function createCustomer(overrideStoreId = storeId) {
  const [row] = await db.insert(customers).values({ storeId: overrideStoreId, name: 'Ana', phone: '99999-0000' }).returning();
  return row;
}

function putReq(body: unknown) {
  return unlockedRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify(body) });
}

function deleteReq() {
  return unlockedRequest('http://localhost', storeId, { method: 'DELETE' });
}

describe('/api/customers/:id', () => {
  it('returns 401 sale_pin_required when the PIN is not unlocked', async () => {
    const customer = await createCustomer();
    const res = await PUT(storeRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ name: 'X', phone: 'X' }) }), {
      params: { id: String(customer.id) },
    });
    expect(res.status).toBe(401);
  });

  it('edits name and phone', async () => {
    const customer = await createCustomer();
    const res = await PUT(putReq({ name: 'Ana Silva', phone: '98888-1111' }), { params: { id: String(customer.id) } });
    const data = await res.json();
    expect(data.customer).toMatchObject({ name: 'Ana Silva', phone: '98888-1111' });
  });

  it('returns 404 when editing a customer that does not exist', async () => {
    const res = await PUT(putReq({ name: 'X', phone: 'X' }), { params: { id: '999999' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 when editing a customer that belongs to a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const customer = await createCustomer(otherStoreId);
    const res = await PUT(putReq({ name: 'X', phone: 'X' }), { params: { id: String(customer.id) } });
    expect(res.status).toBe(404);
  });

  it('rejects an empty name or phone on edit', async () => {
    const customer = await createCustomer();
    const res = await PUT(putReq({ name: '', phone: '98888-1111' }), { params: { id: String(customer.id) } });
    expect(res.status).toBe(400);
  });

  it('removes a customer', async () => {
    const customer = await createCustomer();
    const res = await DELETE(deleteReq(), { params: { id: String(customer.id) } });
    expect(res.status).toBe(200);
    const remaining = await db.select().from(customers);
    expect(remaining).toHaveLength(0);
  });

  it('returns 404 when removing a customer that belongs to a different store, leaving it intact', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const customer = await createCustomer(otherStoreId);
    const res = await DELETE(deleteReq(), { params: { id: String(customer.id) } });
    expect(res.status).toBe(404);
    const remaining = await db.select().from(customers);
    expect(remaining).toHaveLength(1);
  });

  it('returns 404 for a non-integer id instead of throwing', async () => {
    const res = await PUT(putReq({ name: 'X', phone: 'X' }), { params: { id: 'abc' } });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que ambos falham**

Run: `npx vitest run app/api/customers`
Expected: FAIL.

- [ ] **Step 4: Implementar `app/api/customers/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers } from '@/db/schema';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 100;

export async function GET(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE),
  );

  const searchCondition = q ? or(ilike(customers.name, `%${q}%`), ilike(customers.phone, `%${q}%`)) : undefined;
  const where = searchCondition ? and(eq(customers.storeId, storeId), searchCondition) : eq(customers.storeId, storeId);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(customers).where(where);
  const rows = await db
    .select()
    .from(customers)
    .where(where)
    .orderBy(asc(customers.name))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return NextResponse.json({ customers: rows, total: count, page, pageSize });
}

export async function POST(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const name = String(body.name ?? '').trim();
  const phone = String(body.phone ?? '').trim();
  if (!name || !phone) {
    return NextResponse.json({ error: 'invalid_customer' }, { status: 400 });
  }

  const [row] = await db.insert(customers).values({ storeId, name, phone }).returning();
  return NextResponse.json({ customer: row }, { status: 201 });
}
```

- [ ] **Step 5: Implementar `app/api/customers/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers } from '@/db/schema';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const name = String(body.name ?? '').trim();
  const phone = String(body.phone ?? '').trim();
  if (!name || !phone) {
    return NextResponse.json({ error: 'invalid_customer' }, { status: 400 });
  }

  const [row] = await db
    .update(customers)
    .set({ name, phone })
    .where(and(eq(customers.id, id), eq(customers.storeId, storeId)))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ customer: row });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }

  const [row] = await db
    .delete(customers)
    .where(and(eq(customers.id, id), eq(customers.storeId, storeId)))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npx vitest run app/api/customers`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/customers
git commit -m "feat: add Customers API routes"
```

---

### Task 8: Rotas de Vendas

**Files:**
- Create: `app/api/sales/route.ts`
- Create: `app/api/sales/route.test.ts`
- Create: `app/api/sales/[id]/route.ts`
- Create: `app/api/sales/[id]/route.test.ts`

**Interfaces:**
- Consumes: mesmos helpers da Task 7, mais `customers` de `db/schema.ts` (para o join e a validação de que o cliente pertence à loja).
- Produces: `GET`/`POST /api/sales`, `PUT`/`DELETE /api/sales/:id`.

- [ ] **Step 1: Escrever `app/api/sales/route.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { customers } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { GET, POST } from './route';

let storeId: number;
let customerId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
  const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '99999-0000' }).returning();
  customerId = customer.id;
});

function getReq(query = '') {
  return unlockedRequest(`http://localhost/api/sales${query}`, storeId);
}

function postReq(body: unknown) {
  return unlockedRequest('http://localhost/api/sales', storeId, { method: 'POST', body: JSON.stringify(body) });
}

describe('/api/sales', () => {
  it('returns 401 sale_pin_required when the PIN is not unlocked', async () => {
    const res = await GET(storeRequest('http://localhost/api/sales', storeId));
    expect(res.status).toBe(401);
  });

  it('starts empty', async () => {
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.sales).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('creates a sale and includes the customer name when listing', async () => {
    const res = await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 4590 }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.sale).toMatchObject({ customerId, saleDate: '2026-09-14', valueCents: 4590 });

    const listRes = await GET(getReq());
    const listData = await listRes.json();
    expect(listData.sales).toHaveLength(1);
    expect(listData.sales[0].customerName).toBe('Ana');
  });

  it('rejects a customerId that does not exist or belongs to a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const [otherCustomer] = await db.insert(customers).values({ storeId: otherStoreId, name: 'Outra loja', phone: '1' }).returning();

    const res1 = await POST(postReq({ customerId: 999999, saleDate: '2026-09-14', valueCents: 4590 }));
    expect(res1.status).toBe(400);

    const res2 = await POST(postReq({ customerId: otherCustomer.id, saleDate: '2026-09-14', valueCents: 4590 }));
    expect(res2.status).toBe(400);
  });

  it('rejects an invalid or missing saleDate', async () => {
    const res = await POST(postReq({ customerId, saleDate: '14/09/2026', valueCents: 4590 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_date');
  });

  it('rejects a zero or negative valueCents', async () => {
    const res = await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 0 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_value');
  });

  it('only lists sales from the current store', async () => {
    await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 4590 }));
    const res = await GET(getReq());
    expect((await res.json()).sales).toHaveLength(1);

    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const otherRes = await GET(unlockedRequest('http://localhost/api/sales', otherStoreId));
    expect((await otherRes.json()).sales).toHaveLength(0);
  });

  it('paginates results', async () => {
    for (let i = 1; i <= 3; i++) {
      await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 1000 * i }));
    }
    const res = await GET(getReq('?pageSize=2&page=1'));
    const data = await res.json();
    expect(data.sales).toHaveLength(2);
    expect(data.total).toBe(3);
  });

  it('returns 400 invalid_json when the body is malformed', async () => {
    const res = await POST(unlockedRequest('http://localhost/api/sales', storeId, { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Escrever `app/api/sales/[id]/route.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { customers, sales } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { DELETE, PUT } from './route';

let storeId: number;
let customerId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
  const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '99999-0000' }).returning();
  customerId = customer.id;
});

async function createSale(overrideStoreId = storeId, overrideCustomerId = customerId) {
  const [row] = await db
    .insert(sales)
    .values({ storeId: overrideStoreId, customerId: overrideCustomerId, saleDate: '2026-09-14', valueCents: 4590 })
    .returning();
  return row;
}

function putReq(body: unknown) {
  return unlockedRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify(body) });
}

function deleteReq() {
  return unlockedRequest('http://localhost', storeId, { method: 'DELETE' });
}

describe('/api/sales/:id', () => {
  it('returns 401 sale_pin_required when the PIN is not unlocked', async () => {
    const sale = await createSale();
    const res = await PUT(storeRequest('http://localhost', storeId, { method: 'PUT', body: JSON.stringify({ customerId, saleDate: '2026-09-14', valueCents: 100 }) }), {
      params: { id: String(sale.id) },
    });
    expect(res.status).toBe(401);
  });

  it('edits date and value', async () => {
    const sale = await createSale();
    const res = await PUT(putReq({ customerId, saleDate: '2026-01-01', valueCents: 1000 }), { params: { id: String(sale.id) } });
    const data = await res.json();
    expect(data.sale).toMatchObject({ saleDate: '2026-01-01', valueCents: 1000 });
  });

  it('returns 404 when editing a sale that belongs to a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const [otherCustomer] = await db.insert(customers).values({ storeId: otherStoreId, name: 'Outra loja', phone: '1' }).returning();
    const sale = await createSale(otherStoreId, otherCustomer.id);
    const res = await PUT(putReq({ customerId: otherCustomer.id, saleDate: '2026-01-01', valueCents: 1000 }), { params: { id: String(sale.id) } });
    expect(res.status).toBe(404);
  });

  it('rejects an invalid value on edit', async () => {
    const sale = await createSale();
    const res = await PUT(putReq({ customerId, saleDate: '2026-01-01', valueCents: -5 }), { params: { id: String(sale.id) } });
    expect(res.status).toBe(400);
  });

  it('removes a sale', async () => {
    const sale = await createSale();
    const res = await DELETE(deleteReq(), { params: { id: String(sale.id) } });
    expect(res.status).toBe(200);
    const remaining = await db.select().from(sales);
    expect(remaining).toHaveLength(0);
  });

  it('returns 404 when removing a sale that belongs to a different store, leaving it intact', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const [otherCustomer] = await db.insert(customers).values({ storeId: otherStoreId, name: 'Outra loja', phone: '1' }).returning();
    const sale = await createSale(otherStoreId, otherCustomer.id);
    const res = await DELETE(deleteReq(), { params: { id: String(sale.id) } });
    expect(res.status).toBe(404);
    const remaining = await db.select().from(sales);
    expect(remaining).toHaveLength(1);
  });

  it('returns 404 for a non-integer id instead of throwing', async () => {
    const res = await PUT(putReq({ customerId, saleDate: '2026-01-01', valueCents: 1000 }), { params: { id: 'abc' } });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que ambos falham**

Run: `npx vitest run app/api/sales`
Expected: FAIL.

- [ ] **Step 4: Implementar `app/api/sales/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, sales } from '@/db/schema';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 100;
const SALE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE),
  );

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(sales).where(eq(sales.storeId, storeId));
  const rows = await db
    .select({
      id: sales.id,
      saleDate: sales.saleDate,
      valueCents: sales.valueCents,
      customerId: sales.customerId,
      customerName: customers.name,
    })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(eq(sales.storeId, storeId))
    .orderBy(desc(sales.saleDate), desc(sales.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return NextResponse.json({ sales: rows, total: count, page, pageSize });
}

export async function POST(req: Request) {
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const customerId = Number(body.customerId);
  const saleDate = String(body.saleDate ?? '');
  const valueCents = Number(body.valueCents);

  if (!Number.isInteger(customerId)) {
    return NextResponse.json({ error: 'invalid_customer' }, { status: 400 });
  }
  if (!SALE_DATE_PATTERN.test(saleDate)) {
    return NextResponse.json({ error: 'invalid_date' }, { status: 400 });
  }
  if (!Number.isInteger(valueCents) || valueCents <= 0) {
    return NextResponse.json({ error: 'invalid_value' }, { status: 400 });
  }

  const customerRows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.storeId, storeId)))
    .limit(1);
  if (!customerRows[0]) {
    return NextResponse.json({ error: 'invalid_customer' }, { status: 400 });
  }

  const [row] = await db.insert(sales).values({ storeId, customerId, saleDate, valueCents }).returning();
  return NextResponse.json({ sale: row }, { status: 201 });
}
```

- [ ] **Step 5: Implementar `app/api/sales/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, sales } from '@/db/schema';
import { isSalePinUnlocked } from '@/lib/salePin';
import { getStoreIdFromRequest } from '@/lib/store';

export const dynamic = 'force-dynamic';

const SALE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const customerId = Number(body.customerId);
  const saleDate = String(body.saleDate ?? '');
  const valueCents = Number(body.valueCents);

  if (!Number.isInteger(customerId)) {
    return NextResponse.json({ error: 'invalid_customer' }, { status: 400 });
  }
  if (!SALE_DATE_PATTERN.test(saleDate)) {
    return NextResponse.json({ error: 'invalid_date' }, { status: 400 });
  }
  if (!Number.isInteger(valueCents) || valueCents <= 0) {
    return NextResponse.json({ error: 'invalid_value' }, { status: 400 });
  }

  const customerRows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.storeId, storeId)))
    .limit(1);
  if (!customerRows[0]) {
    return NextResponse.json({ error: 'invalid_customer' }, { status: 400 });
  }

  const [row] = await db
    .update(sales)
    .set({ customerId, saleDate, valueCents })
    .where(and(eq(sales.id, id), eq(sales.storeId, storeId)))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ sale: row });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const storeId = getStoreIdFromRequest(req);
  if (!isSalePinUnlocked(req, storeId)) {
    return NextResponse.json({ error: 'sale_pin_required' }, { status: 401 });
  }

  const [row] = await db
    .delete(sales)
    .where(and(eq(sales.id, id), eq(sales.storeId, storeId)))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npx vitest run app/api/sales`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/sales
git commit -m "feat: add Sales API routes"
```

---

### Task 9: Nav — item "Recompensas"

**Files:**
- Modify: `components/ui/Nav.tsx`
- Modify: `components/ui/Nav.test.tsx`

- [ ] **Step 1: Editar o teste**

No `describe('Nav', ...)` de `components/ui/Nav.test.tsx`, dentro do teste `'renders a link to every main section'`, adicione esta linha depois da asserção de `'Grupos'`:

```tsx
    expect(screen.getByRole('link', { name: 'Recompensas' })).toHaveAttribute('href', '/recompensas');
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run components/ui/Nav.test.tsx`
Expected: FAIL — link "Recompensas" não existe.

- [ ] **Step 3: Editar `components/ui/Nav.tsx`**

No array `LINKS`, adicione uma entrada depois de `Grupos` e antes de `Configurações`:

```ts
const LINKS = [
  { href: '/', label: 'Início' },
  { href: '/history', label: 'Histórico' },
  { href: '/products', label: 'Produtos' },
  { href: '/groups', label: 'Grupos' },
  { href: '/recompensas', label: 'Recompensas' },
  { href: '/settings', label: 'Configurações' },
];
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run components/ui/Nav.test.tsx`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add components/ui/Nav.tsx components/ui/Nav.test.tsx
git commit -m "feat: add Recompensas link to the nav"
```

---

### Task 10: Página `/recompensas/clientes`

**Files:**
- Create: `app/recompensas/clientes/page.tsx`
- Create: `app/recompensas/clientes/page.test.tsx`

**Interfaces:**
- Consumes: `PinGate` (`components/PinGate.tsx`), `Table` (`components/ui/Table.tsx`), `Button`/`PageHeading`/`Pagination` (já existentes), `GET`/`POST /api/customers`, `PUT`/`DELETE /api/customers/:id`.

- [ ] **Step 1: Escrever o teste**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClientesPage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'store_id=; path=/; max-age=0';
  document.cookie = 'sale_pin_ok=; path=/; max-age=0';
});

function unlock() {
  document.cookie = 'store_id=1; path=/';
  document.cookie = 'sale_pin_ok=1; path=/';
}

describe('ClientesPage', () => {
  it('shows the PIN form when not unlocked', async () => {
    document.cookie = 'store_id=1; path=/';
    render(<ClientesPage />);
    await waitFor(() => expect(screen.getByPlaceholderText('PIN')).toBeInTheDocument());
  });

  it('lists customers when unlocked', async () => {
    unlock();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ customers: [{ id: 1, name: 'Ana', phone: '99999-0000' }], total: 1 }),
      }),
    );
    render(<ClientesPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
  });

  it('creates a customer', async () => {
    unlock();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ customers: [], total: 0 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ customer: { id: 1, name: 'Ana', phone: '99999-0000' } }) })
      .mockResolvedValueOnce({ json: async () => ({ customers: [{ id: 1, name: 'Ana', phone: '99999-0000' }], total: 1 }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClientesPage />);
    await waitFor(() => expect(screen.getByText('Nenhum cliente cadastrado.')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Nome do cliente'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByPlaceholderText('Telefone'), { target: { value: '99999-0000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
  });

  it('removes a customer after confirming', async () => {
    unlock();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ customers: [{ id: 1, name: 'Ana', phone: '99999-0000' }], total: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ json: async () => ({ customers: [], total: 0 }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClientesPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/customers/1', { method: 'DELETE' }));
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run app/recompensas/clientes/page.test.tsx`
Expected: FAIL — módulo `./page` não existe.

- [ ] **Step 3: Implementar `app/recompensas/clientes/page.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { PageHeading } from '@/components/ui/PageHeading';
import { Pagination } from '@/components/ui/Pagination';
import { Table } from '@/components/ui/Table';
import { PinGate } from '@/components/PinGate';

interface Customer {
  id: number;
  name: string;
  phone: string;
}

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 300;

export default function ClientesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const savingRef = useRef(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      setDebouncedQuery(query);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedQuery) params.set('q', debouncedQuery);
    const res = await fetch(`/api/customers?${params.toString()}`);
    const data = await res.json();
    setCustomers(data.customers ?? []);
    setTotal(data.total ?? 0);
  }, [page, debouncedQuery]);

  useEffect(() => {
    load();
  }, [load]);

  async function addCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName || !trimmedPhone) {
      setFormError('Preencha nome e telefone.');
      return;
    }
    setFormError(null);
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, phone: trimmedPhone }),
      });
      if (!res.ok) {
        setFormError('Não foi possível cadastrar o cliente.');
        return;
      }
      setName('');
      setPhone('');
      load();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function startEdit(customer: Customer) {
    setEditingId(customer.id);
    setEditName(customer.name);
    setEditPhone(customer.phone);
  }

  async function saveEdit(id: number) {
    const trimmedName = editName.trim();
    const trimmedPhone = editPhone.trim();
    if (!trimmedName || !trimmedPhone) return;
    await fetch(`/api/customers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmedName, phone: trimmedPhone }),
    });
    setEditingId(null);
    load();
  }

  async function removeCustomer(id: number) {
    if (!window.confirm('Remover este cliente?')) return;
    await fetch(`/api/customers/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <PinGate>
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <PageHeading>Clientes</PageHeading>
          <Link href="/recompensas" className="text-sm font-semibold text-accent hover:underline">
            Voltar pra Recompensas
          </Link>
        </div>

        <form onSubmit={addCustomer} className="mb-6 flex flex-wrap gap-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do cliente"
            className="flex-1 rounded-xl border-2 border-gray-300 px-4 py-4 text-xl placeholder:text-sm"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Telefone"
            className="w-48 rounded-xl border-2 border-gray-300 px-4 py-4 text-xl placeholder:text-sm"
          />
          <Button type="submit" disabled={saving}>
            {saving ? 'Adicionando...' : 'Adicionar'}
          </Button>
        </form>
        {formError && <p className="mb-4 text-lg text-red-600">{formError}</p>}

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          aria-label="Buscar clientes"
          className="mb-6 w-full rounded-xl border-2 border-gray-300 px-4 py-4 text-xl placeholder:text-sm"
        />

        <Table
          columns={[
            {
              header: 'Nome',
              render: (c: Customer) =>
                editingId === c.id ? (
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1"
                  />
                ) : (
                  c.name
                ),
            },
            {
              header: 'Telefone',
              render: (c: Customer) =>
                editingId === c.id ? (
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1"
                  />
                ) : (
                  c.phone
                ),
            },
            {
              header: 'Ações',
              render: (c: Customer) =>
                editingId === c.id ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => saveEdit(c.id)} className="text-sm font-semibold text-accent hover:underline">
                      Salvar
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-sm text-gray-500 hover:underline">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => startEdit(c)} className="text-sm font-semibold text-accent hover:underline">
                      Editar
                    </button>
                    <button type="button" onClick={() => removeCustomer(c.id)} className="text-sm font-semibold text-danger hover:underline">
                      Remover
                    </button>
                  </div>
                ),
            },
          ]}
          rows={customers}
          emptyMessage={debouncedQuery ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum cliente cadastrado.'}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      </main>
    </PinGate>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run app/recompensas/clientes/page.test.tsx`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add app/recompensas/clientes
git commit -m "feat: add /recompensas/clientes customer management page"
```

---

### Task 11: `components/CustomerPicker.tsx`

**Files:**
- Create: `components/CustomerPicker.tsx`
- Create: `components/CustomerPicker.test.tsx`

**Interfaces:**
- Consumes: `Button` (`components/ui/Button.tsx`), `GET`/`POST /api/customers`.
- Produces: `CustomerPicker({ onSelect }: { onSelect: (customer: { id: number; name: string; phone: string }) => void })`.

- [ ] **Step 1: Escrever o teste**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerPicker } from './CustomerPicker';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CustomerPicker', () => {
  it('does not search until a query is typed', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<CustomerPicker onSelect={() => {}} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows matching customers after typing, debounced', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ customers: [{ id: 1, name: 'Ana', phone: '99999-0000' }], total: 1 }) }),
    );
    render(<CustomerPicker onSelect={() => {}} />);
    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Ana' } });
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
  });

  it('calls onSelect when a result is clicked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ customers: [{ id: 1, name: 'Ana', phone: '99999-0000' }], total: 1 }) }),
    );
    const onSelect = vi.fn();
    render(<CustomerPicker onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Ana' } });
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Ana'));
    expect(onSelect).toHaveBeenCalledWith({ id: 1, name: 'Ana', phone: '99999-0000' });
  });

  it('shows a create-customer form pre-filled with the query when the search finds nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ customers: [], total: 0 }) }));
    render(<CustomerPicker onSelect={() => {}} />);
    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Bia' } });
    await waitFor(() => expect(screen.getByText('Cliente não encontrado.')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Cadastrar novo cliente'));
    expect(screen.getByPlaceholderText('Nome do cliente')).toHaveValue('Bia');
  });

  it('creates a customer and calls onSelect with the created customer', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ customers: [], total: 0 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ customer: { id: 2, name: 'Bia', phone: '98888-0000' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const onSelect = vi.fn();
    render(<CustomerPicker onSelect={onSelect} />);

    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Bia' } });
    await waitFor(() => expect(screen.getByText('Cliente não encontrado.')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Cadastrar novo cliente'));
    fireEvent.change(screen.getByPlaceholderText('Telefone'), { target: { value: '98888-0000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar e selecionar' }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith({ id: 2, name: 'Bia', phone: '98888-0000' }));
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run components/CustomerPicker.test.tsx`
Expected: FAIL — módulo `./CustomerPicker` não existe.

- [ ] **Step 3: Implementar `components/CustomerPicker.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

interface Customer {
  id: number;
  name: string;
  phone: string;
}

const SEARCH_DEBOUNCE_MS = 300;

export function CustomerPicker({ onSelect }: { onSelect: (customer: Customer) => void }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [searched, setSearched] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  const search = useCallback(async () => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    const res = await fetch(`/api/customers?q=${encodeURIComponent(debouncedQuery)}&pageSize=8`);
    const data = await res.json();
    setResults(data.customers ?? []);
    setSearched(true);
  }, [debouncedQuery]);

  useEffect(() => {
    search();
  }, [search]);

  function pick(customer: Customer) {
    setQuery('');
    setDebouncedQuery('');
    setResults([]);
    setSearched(false);
    setShowCreateForm(false);
    onSelect(customer);
  }

  function openCreateForm() {
    setNewName(query);
    setNewPhone('');
    setError(null);
    setShowCreateForm(true);
  }

  async function createCustomer(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = newName.trim();
    const trimmedPhone = newPhone.trim();
    if (!trimmedName || !trimmedPhone) {
      setError('Preencha nome e telefone.');
      return;
    }
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmedName, phone: trimmedPhone }),
    });
    if (!res.ok) {
      setError('Não foi possível cadastrar o cliente.');
      return;
    }
    const data = await res.json();
    pick(data.customer);
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShowCreateForm(false);
        }}
        placeholder="Buscar cliente por nome ou telefone..."
        aria-label="Buscar cliente"
        className="w-full rounded-xl border-2 border-gray-300 px-4 py-4 text-xl placeholder:text-sm"
      />
      {results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => pick(c)}
                className="w-full rounded-xl border border-gray-200 bg-paper px-4 py-3 text-left hover:bg-canvas"
              >
                <span className="font-semibold">{c.name}</span> <span className="text-sm text-gray-500">{c.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searched && results.length === 0 && !showCreateForm && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-canvas px-4 py-3">
          <span className="text-sm text-gray-600">Cliente não encontrado.</span>
          <button type="button" onClick={openCreateForm} className="text-sm font-semibold text-accent hover:underline">
            Cadastrar novo cliente
          </button>
        </div>
      )}
      {showCreateForm && (
        <form onSubmit={createCustomer} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome do cliente"
            className="w-full rounded-xl border-2 border-gray-300 px-4 py-3 text-lg placeholder:text-sm"
          />
          <input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="Telefone"
            className="w-full rounded-xl border-2 border-gray-300 px-4 py-3 text-lg placeholder:text-sm"
          />
          <Button type="submit">Cadastrar e selecionar</Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run components/CustomerPicker.test.tsx`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add components/CustomerPicker.tsx components/CustomerPicker.test.tsx
git commit -m "feat: add CustomerPicker component (search, select, inline create)"
```

---

### Task 12: Página `/recompensas`

**Files:**
- Create: `app/recompensas/page.tsx`
- Create: `app/recompensas/page.test.tsx`

**Interfaces:**
- Consumes: `PinGate` (Task 5), `CustomerPicker` (Task 11), `Table` (Task 4), `formatCentsAsBRL` (Task 3), `Button`/`PageHeading`/`Pagination` (já existentes), `GET`/`POST /api/sales`, `PUT`/`DELETE /api/sales/:id`.

- [ ] **Step 1: Escrever o teste**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RecompensasPage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'store_id=; path=/; max-age=0';
  document.cookie = 'sale_pin_ok=; path=/; max-age=0';
});

function unlock() {
  document.cookie = 'store_id=1; path=/';
  document.cookie = 'sale_pin_ok=1; path=/';
}

describe('RecompensasPage', () => {
  it('shows the PIN form when not unlocked', async () => {
    document.cookie = 'store_id=1; path=/';
    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByPlaceholderText('PIN')).toBeInTheDocument());
  });

  it('lists sales when unlocked', async () => {
    unlock();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          sales: [{ id: 1, saleDate: '2026-09-14', valueCents: 4590, customerId: 1, customerName: 'Ana' }],
          total: 1,
        }),
      }),
    );
    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    expect(screen.getByText('R$ 45,90')).toBeInTheDocument();
  });

  it('searches, selects a customer, and registers a sale', async () => {
    unlock();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url.startsWith('/api/sales?') && method === 'GET') {
        return Promise.resolve({ json: async () => ({ sales: [], total: 0 }) });
      }
      if (url.startsWith('/api/customers?q=Ana')) {
        return Promise.resolve({ json: async () => ({ customers: [{ id: 1, name: 'Ana', phone: '99999-0000' }], total: 1 }) });
      }
      if (url === '/api/sales' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ sale: { id: 1, saleDate: '2026-09-14', valueCents: 4590, customerId: 1 } }),
        });
      }
      return Promise.resolve({ json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Nenhuma venda lançada ainda.')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Ana' } });
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Ana'));

    fireEvent.change(screen.getByLabelText('Valor da venda'), { target: { value: '45.90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar venda' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([u, i]: [string, RequestInit?]) => u === '/api/sales' && i?.method === 'POST');
      expect(postCall).toBeDefined();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.customerId).toBe(1);
      expect(body.valueCents).toBe(4590);
      expect(body.saleDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it('removes a sale after confirming', async () => {
    unlock();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ sales: [{ id: 1, saleDate: '2026-09-14', valueCents: 4590, customerId: 1, customerName: 'Ana' }], total: 1 }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ json: async () => ({ sales: [], total: 0 }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/sales/1', { method: 'DELETE' }));
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run app/recompensas/page.test.tsx`
Expected: FAIL — módulo `./page` não existe.

- [ ] **Step 3: Implementar `app/recompensas/page.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { PageHeading } from '@/components/ui/PageHeading';
import { Pagination } from '@/components/ui/Pagination';
import { Table } from '@/components/ui/Table';
import { CustomerPicker } from '@/components/CustomerPicker';
import { PinGate } from '@/components/PinGate';
import { formatCentsAsBRL } from '@/lib/currency';

interface Customer {
  id: number;
  name: string;
  phone: string;
}

interface Sale {
  id: number;
  saleDate: string;
  valueCents: number;
  customerId: number;
  customerName: string;
}

const PAGE_SIZE = 10;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RecompensasPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [saleDate, setSaleDate] = useState(todayIso());
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSaleDate, setEditSaleDate] = useState('');
  const [editValue, setEditValue] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    const res = await fetch(`/api/sales?${params.toString()}`);
    const data = await res.json();
    setSales(data.sales ?? []);
    setTotal(data.total ?? 0);
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  async function registerSale(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomer) {
      setFormError('Selecione um cliente.');
      return;
    }
    const numericValue = Number(value);
    if (!value || Number.isNaN(numericValue) || numericValue <= 0) {
      setFormError('Informe um valor válido.');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          saleDate,
          valueCents: Math.round(numericValue * 100),
        }),
      });
      if (!res.ok) {
        setFormError('Não foi possível registrar a venda.');
        return;
      }
      setSelectedCustomer(null);
      setSaleDate(todayIso());
      setValue('');
      setPage(1);
      load();
    } finally {
      setSaving(false);
    }
  }

  function startEdit(sale: Sale) {
    setEditingId(sale.id);
    setEditSaleDate(sale.saleDate);
    setEditValue((sale.valueCents / 100).toFixed(2));
  }

  async function saveEdit(sale: Sale) {
    const numericValue = Number(editValue);
    if (!editValue || Number.isNaN(numericValue) || numericValue <= 0) return;
    await fetch(`/api/sales/${sale.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: sale.customerId,
        saleDate: editSaleDate,
        valueCents: Math.round(numericValue * 100),
      }),
    });
    setEditingId(null);
    load();
  }

  async function removeSale(id: number) {
    if (!window.confirm('Remover esta venda?')) return;
    await fetch(`/api/sales/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <PinGate>
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <PageHeading>Recompensas</PageHeading>
          <Link href="/recompensas/clientes" className="text-sm font-semibold text-accent hover:underline">
            Gerenciar clientes
          </Link>
        </div>

        <form onSubmit={registerSale} className="mb-10 flex flex-col gap-4">
          {selectedCustomer ? (
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-canvas px-4 py-3">
              <span>
                <span className="font-semibold">{selectedCustomer.name}</span>{' '}
                <span className="text-sm text-gray-500">{selectedCustomer.phone}</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="text-sm font-semibold text-gray-500 hover:underline"
              >
                Trocar
              </button>
            </div>
          ) : (
            <CustomerPicker onSelect={setSelectedCustomer} />
          )}

          <div className="flex flex-wrap gap-4">
            <input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              aria-label="Data da venda"
              className="rounded-xl border-2 border-gray-300 px-4 py-4 text-xl"
            />
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Valor (R$)"
              aria-label="Valor da venda"
              className="w-40 rounded-xl border-2 border-gray-300 px-4 py-4 text-xl placeholder:text-sm"
            />
            <Button type="submit" disabled={saving}>
              {saving ? 'Registrando...' : 'Registrar venda'}
            </Button>
          </div>
          {formError && <p className="text-lg text-red-600">{formError}</p>}
        </form>

        <h2 className="mb-4 text-xl font-bold">Vendas lançadas</h2>
        <Table
          columns={[
            {
              header: 'Data',
              render: (s: Sale) =>
                editingId === s.id ? (
                  <input
                    type="date"
                    value={editSaleDate}
                    onChange={(e) => setEditSaleDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1"
                  />
                ) : (
                  s.saleDate
                ),
            },
            { header: 'Cliente', render: (s: Sale) => s.customerName },
            {
              header: 'Valor',
              render: (s: Sale) =>
                editingId === s.id ? (
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-24 rounded-lg border border-gray-300 px-2 py-1"
                  />
                ) : (
                  formatCentsAsBRL(s.valueCents)
                ),
            },
            {
              header: 'Ações',
              render: (s: Sale) =>
                editingId === s.id ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => saveEdit(s)} className="text-sm font-semibold text-accent hover:underline">
                      Salvar
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-sm text-gray-500 hover:underline">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => startEdit(s)} className="text-sm font-semibold text-accent hover:underline">
                      Editar
                    </button>
                    <button type="button" onClick={() => removeSale(s.id)} className="text-sm font-semibold text-danger hover:underline">
                      Remover
                    </button>
                  </div>
                ),
            },
          ]}
          rows={sales}
          emptyMessage="Nenhuma venda lançada ainda."
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      </main>
    </PinGate>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run app/recompensas/page.test.tsx`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add app/recompensas/page.tsx app/recompensas/page.test.tsx
git commit -m "feat: add /recompensas sale registration page"
```

---

### Task 13: Suite completa, checagem manual e README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rodar a suite inteira**

Run: `npm test`
Expected: PASS — todos os arquivos, incluindo os das tarefas anteriores.

- [ ] **Step 2: Checagem manual no navegador**

Defina PINs de teste antes de rodar o servidor local, por exemplo via `.env`:

```
SALE_PIN_COXIM_MS=1234
SALE_PIN_CAMPO_GRANDE_MS=5678
```

Run: `npm run dev`, abra `http://localhost:3000`, escolha uma loja.

Confirme manualmente:
1. O item "Recompensas" aparece no menu.
2. `/recompensas` pede o PIN antes de mostrar qualquer conteúdo.
3. Com o PIN certo, a tela libera: buscar um cliente que não existe mostra "Cliente não encontrado — Cadastrar novo cliente"; cadastrar um novo cliente já o seleciona.
4. Lançar uma venda (cliente + data + valor) aparece na lista "Vendas lançadas" logo abaixo, formatada em R$.
5. Editar e remover uma venda funcionam.
6. "Gerenciar clientes" leva a `/recompensas/clientes`, já destravada (mesmo PIN); a grade é paginada e as linhas alternam de cor.
7. Trocar de loja (menu → "Trocar loja") e entrar em `/recompensas` de novo pede o PIN de novo — o PIN de uma loja não destrava a outra.
8. Redimensionar a janela pra largura de celular: grades continuam legíveis, com scroll horizontal se precisar, sem quebrar layout.

- [ ] **Step 3: Atualizar o README**

Em `README.md`, depois da seção "## Lojas (Coxim-MS e Campo Grande-MS)", adicione:

```markdown
## Programa de recompensa: clientes e vendas

`/recompensas` registra vendas (cliente, data, valor) pro programa de cashback — sem produto, já que a venda em si continua sendo lançada no sistema de vendas da loja. A tela busca clientes já cadastrados (com opção de cadastrar um novo na hora) e lista as vendas já lançadas naquela loja. `/recompensas/clientes` gerencia o cadastro de clientes (nome, telefone) separadamente.

Ambas as telas ficam atrás de um PIN por loja — não é controle de usuário (não sabe quem lançou o quê), só uma trava simples contra acesso por pessoas de fora. O PIN de cada loja é uma variável de ambiente, nome derivado do slug: `SALE_PIN_COXIM_MS`, `SALE_PIN_CAMPO_GRANDE_MS`. Digitar o PIN uma vez destrava o dispositivo pra aquela loja (cookie perene) até trocar de loja ou limpar os cookies.

Ainda não há cálculo de saldo/cashback nem envio de WhatsApp — isso é um sub-projeto futuro que usa as vendas registradas aqui.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document the customer/sale rewards registration flow"
```
