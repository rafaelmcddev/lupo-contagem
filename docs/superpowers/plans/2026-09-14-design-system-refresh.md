# Refresh Visual Profissional (Design System) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the "amateur" look of the app by adding depth (soft shadows) and a proper
input focus treatment (thin border + colored ring) system-wide, without adding any new
dependency and without changing the office-vs-counting screen size distinction
established in an earlier fix this session.

**Architecture:** Almost entirely Tailwind className edits to existing components and
pages — no new components, no new state, no new routes. Five shared UI components
(`Button`, `Table`, `Card`, `Nav`, `Pagination`) get the new visual treatment once;
every plain `<input>` across the app (excluding `BarcodeInput`, which already has the
correct treatment) switches from a thick static border to a thin border + focus ring.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-14-design-system-refresh-design.md`

## Global Constraints

- Never change an input's width, padding, or font-size class as part of this plan —
  those were already set correctly in an earlier fix this session (office screens
  compact, counting/scanner screens large/touch). This plan only touches border width
  and adds focus-state classes.
- The border/focus formula for a plain gray-bordered input is exactly:
  `border-2 border-gray-300` → `border border-gray-300 focus:border-accent
  focus:ring-2 focus:ring-accent/20 focus:outline-none`. Where an input already uses
  `border border-gray-300` (1px, inside `Table` row-edit cells), only append
  `focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none` — do not
  touch the border width, it's already correct.
- **Never touch `components/BarcodeInput.tsx`** — it already uses `border-2
  border-accent` + `focus:ring-2 focus:ring-accent/40` on purpose (a permanently
  colored border showing the field is always active for scanning), which is the
  correct pattern already.
- Every task ends with `npm test` passing 100% (no failures, no unhandled rejections)
  before committing.
- Commit message prefix `style:` for every task in this plan (pure visual change, no
  behavior change).

---

### Task 1: Shared UI components — Button, Table, Card, Nav, Pagination

**Files:**
- Modify: `components/ui/Button.tsx`
- Modify: `components/ui/Table.tsx`
- Modify: `components/ui/Card.tsx`
- Modify: `components/ui/Nav.tsx`
- Modify: `components/ui/Pagination.tsx`
- Test: `components/ui/Button.test.tsx`, `components/ui/Table.test.tsx`,
  `components/ui/Nav.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: no prop/signature changes to any of the five components — every consumer
  across the app keeps working unchanged. `Pagination` keeps the exact same props
  (`page`, `pageSize`, `total`, `onPageChange`) and behavior, only its internal markup
  changes (uses `Button` instead of a hand-rolled `<button>`).

- [ ] **Step 1: Write the failing tests**

Add to `components/ui/Button.test.tsx` (after the existing tests, inside the
`describe('Button', ...)` block):

```tsx
  it('adds a subtle shadow to the primary variant but not to secondary/danger', () => {
    const { rerender } = render(<Button>Primary</Button>);
    expect(screen.getByText('Primary')).toHaveClass('shadow-sm');

    rerender(<Button variant="secondary">Secondary</Button>);
    expect(screen.getByText('Secondary')).not.toHaveClass('shadow-sm');

    rerender(<Button variant="danger">Danger</Button>);
    expect(screen.getByText('Danger')).not.toHaveClass('shadow-sm');
  });
```

Add to `components/ui/Table.test.tsx` (check the existing file's structure first —
add a new `it` block at the end of the `describe`):

```tsx
  it('gives the header row a light, uppercase treatment instead of a filled background', () => {
    render(
      <Table<{ id: number; name: string }>
        columns={[{ header: 'Nome', render: (r) => r.name }]}
        rows={[{ id: 1, name: 'Ana' }]}
        emptyMessage="Vazio"
      />,
    );
    const header = screen.getByText('Nome');
    expect(header).toHaveClass('uppercase');
    expect(header).not.toHaveClass('bg-canvas');
  });

  it('adds a hover highlight to each row', () => {
    render(
      <Table<{ id: number; name: string }>
        columns={[{ header: 'Nome', render: (r) => r.name }]}
        rows={[{ id: 1, name: 'Ana' }]}
        emptyMessage="Vazio"
      />,
    );
    const row = screen.getByText('Ana').closest('tr');
    expect(row).toHaveClass('hover:bg-accent-light/60');
  });
```

Add to `components/ui/Nav.test.tsx` (new `it` at the end of the `describe`):

```tsx
  it('has a subtle shadow separating it from the page content', () => {
    render(<Nav />);
    expect(screen.getByRole('navigation')).toHaveClass('shadow-sm');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/ui/Button.test.tsx components/ui/Table.test.tsx components/ui/Nav.test.tsx`
Expected: the 3 new tests FAIL (classes don't exist yet); all pre-existing tests in
these files still PASS.

- [ ] **Step 3: Implement — `components/ui/Button.tsx`**

In the `variantClasses` map, add `shadow-sm` only to `primary`:

```ts
const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent text-white shadow-sm hover:bg-accent-dark active:bg-accent-dark',
  secondary: 'bg-canvas text-ink border border-gray-200 hover:bg-gray-100 active:bg-gray-200',
  danger: 'bg-danger text-white hover:bg-red-800 active:bg-red-900',
};
```

- [ ] **Step 4: Implement — `components/ui/Table.tsx`**

Replace the `<thead>` block:

```tsx
        <thead>
          <tr className="border-b border-gray-200">
            {columns.map((col) => (
              <th
                key={col.header}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
```

Replace the row `className` inside `<tbody>`:

```tsx
            <tr key={row.id} className={`transition-colors hover:bg-accent-light/60 ${i % 2 === 0 ? 'bg-paper' : 'bg-canvas'}`}>
```

Replace the outer container `className` (the `<div>` wrapping `<table>`):

```tsx
    <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
```

- [ ] **Step 5: Implement — `components/ui/Card.tsx`**

```tsx
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-gray-200 bg-paper p-5 shadow-sm transition-shadow sm:p-6 ${className}`}>{children}</div>;
}
```

(Cards used as clickable list items already pass `hover:border-accent` via their own
`className` prop in `app/page.tsx` and `app/history/page.tsx` — Task 3 adds
`hover:shadow-md` there alongside it. No change needed here beyond the base
`shadow-sm transition-shadow`.)

- [ ] **Step 6: Implement — `components/ui/Nav.tsx`**

Change the `<nav>` className from:

```tsx
    <nav className="sticky top-0 z-40 border-b border-gray-200 bg-paper">
```

to:

```tsx
    <nav className="sticky top-0 z-40 border-b border-gray-200 bg-paper shadow-sm">
```

- [ ] **Step 7: Implement — `components/ui/Pagination.tsx`**

Replace the whole file:

```tsx
import { Button } from '@/components/ui/Button';

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className="mt-6 flex items-center justify-center gap-4">
      <Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Anterior
      </Button>
      <span className="text-sm text-gray-600">
        Página {page} de {totalPages}
      </span>
      <Button type="button" variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Próxima
      </Button>
    </div>
  );
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run components/ui/Button.test.tsx components/ui/Table.test.tsx components/ui/Nav.test.tsx components/ui/Pagination.test.tsx`
Expected: all PASS (the 3 new tests plus every pre-existing test in these files;
`Pagination` has no dedicated test file, so just confirm it still compiles/renders via
any page test that uses it, e.g. `npm test -- products`).

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: all test files pass, 0 unhandled rejections (a `Pagination` behavior change
risks breaking any page test that clicks "Anterior"/"Próxima" — e.g.
`app/products/page.test.tsx` if it exercises pagination).

- [ ] **Step 10: Commit**

```bash
git add components/ui/Button.tsx components/ui/Button.test.tsx components/ui/Table.tsx components/ui/Table.test.tsx components/ui/Card.tsx components/ui/Nav.tsx components/ui/Nav.test.tsx components/ui/Pagination.tsx
git commit -m "style: add shadows, refined table header, and a focus-ready button/pagination pattern to shared UI components"
```

---

### Task 2: Rewards-feature screens — Recompensas, Clientes, CustomerPicker, PinGate

**Files:**
- Modify: `app/recompensas/page.tsx`
- Modify: `app/recompensas/clientes/page.tsx`
- Modify: `components/CustomerPicker.tsx`
- Modify: `components/PinGate.tsx`

**Interfaces:**
- Consumes: nothing new from Task 1 beyond the already-existing `Button`/`Table`
  imports these files already have.
- Produces: no prop/behavior changes — only `className` edits on plain `<input>`
  elements. Every existing test in these files' `.test.tsx` companions must keep
  passing unmodified (they assert values/behavior, not border classes).

This task is purely mechanical `className` string replacement — no test changes
needed, since no behavior changes and no test in this codebase currently asserts
`border-2` vs `border` on these specific inputs. Verification is the full suite run
at the end (Step 2) plus the manual browser check after Task 3.

- [ ] **Step 1: Apply the exact edits below**

In `app/recompensas/page.tsx`, the date input's `className`:
```
"rounded-lg border-2 border-gray-300 px-3 py-3 text-base"
```
becomes:
```
"rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
```

The `CurrencyInput` (top form) `className`:
```
"w-40 rounded-lg border-2 border-gray-300 px-3 py-3 text-base placeholder:text-sm"
```
becomes:
```
"w-40 rounded-lg border border-gray-300 px-3 py-3 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
```

The row-edit date `<input>` inside the `Table` "Data" column and the row-edit
`CurrencyInput` inside the "Valor" column both currently use:
```
"w-full rounded-lg border border-gray-300 px-2 py-1"
```
Both become (border width already correct, only append focus classes):
```
"w-full rounded-lg border border-gray-300 px-2 py-1 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
```

In `app/recompensas/clientes/page.tsx`, the name `<input>`:
```
"flex-1 rounded-lg border-2 border-gray-300 px-3 py-3 text-base placeholder:text-sm"
```
becomes:
```
"flex-1 rounded-lg border border-gray-300 px-3 py-3 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
```

The `PhoneInput` (top form) `className`:
```
"w-48 rounded-lg border-2 border-gray-300 px-3 py-3 text-base placeholder:text-sm"
```
becomes:
```
"w-48 rounded-lg border border-gray-300 px-3 py-3 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
```

The search `<input>` (`aria-label="Buscar clientes"`):
```
"mb-6 w-full rounded-lg border-2 border-gray-300 px-3 py-3 text-base placeholder:text-sm"
```
becomes:
```
"mb-6 w-full rounded-lg border border-gray-300 px-3 py-3 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
```

The row-edit name `<input>` and row-edit `PhoneInput` inside the `Table` (both use
`"w-full rounded-lg border border-gray-300 px-2 py-1"`) both become:
```
"w-full rounded-lg border border-gray-300 px-2 py-1 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
```

In `components/CustomerPicker.tsx`, the search `<input>`:
```
"w-full rounded-lg border-2 border-gray-300 px-3 py-3 text-base placeholder:text-sm"
```
becomes:
```
"w-full rounded-lg border border-gray-300 px-3 py-3 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
```

The inline-create name `<input>` and `PhoneInput` (both currently
`"w-full rounded-lg border-2 border-gray-300 px-3 py-2.5 text-base placeholder:text-sm"`)
both become:
```
"w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
```

In `components/PinGate.tsx`, the PIN `<input>`:
```
"w-full rounded-lg border-2 border-gray-300 px-3 py-3 text-base placeholder:text-sm"
```
becomes:
```
"w-full rounded-lg border border-gray-300 px-3 py-3 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: all test files pass, 0 unhandled rejections — no test in this codebase
asserts border width on these inputs, so this should be a clean pass confirming no
behavior broke.

- [ ] **Step 3: Commit**

```bash
git add app/recompensas/page.tsx app/recompensas/clientes/page.tsx components/CustomerPicker.tsx components/PinGate.tsx
git commit -m "style: thin borders + accent focus ring on every input in the rewards flow"
```

---

### Task 3: Remaining screens — Home, Products, Countings detail, Settings, Groups, History

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/products/page.tsx`
- Modify: `app/countings/[id]/page.tsx`
- Modify: `app/settings/page.tsx`
- Modify: `app/groups/page.tsx`
- Modify: `app/history/page.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: no prop/behavior changes — only `className` edits on plain `<input>`
  elements, plus `hover:shadow-md` added next to the pre-existing `hover:border-accent`
  on the two clickable `Card` usages (Home's and History's counting-list cards).

- [ ] **Step 1: Apply the exact edits below**

In `app/page.tsx`, the "nome da contagem" `<input>`:
```
"flex-1 rounded-xl border-2 border-gray-300 px-4 py-4 text-xl placeholder:text-sm"
```
becomes:
```
"flex-1 rounded-xl border border-gray-300 px-4 py-4 text-xl placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
```

The "buscar contagem" `<input>`:
```
"mb-4 w-full rounded-xl border-2 border-gray-300 px-4 py-3 text-lg placeholder:text-sm"
```
becomes:
```
"mb-4 w-full rounded-xl border border-gray-300 px-4 py-3 text-lg placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
```

The clickable `Card`:
```
<Card className="relative hover:border-accent">
```
becomes:
```
<Card className="relative hover:border-accent hover:shadow-md">
```

In `app/products/page.tsx`, all six `border-2 border-gray-300` occurrences (código de
barras, SKU, nome, busca, SKU em edição, nome em edição) get `border-2` → `border`
plus `focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none`
appended, keeping every other class (widths, padding, text size, placeholder classes)
exactly as they are today. Concretely:

- `"w-48 rounded-lg border-2 border-gray-300 px-3 py-3 text-base placeholder:text-sm"` → `"w-48 rounded-lg border border-gray-300 px-3 py-3 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"`
- `"w-40 rounded-lg border-2 border-gray-300 px-3 py-3 text-base placeholder:text-sm"` → `"w-40 rounded-lg border border-gray-300 px-3 py-3 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"`
- `"flex-1 rounded-lg border-2 border-gray-300 px-3 py-3 text-base placeholder:text-sm"` → `"flex-1 rounded-lg border border-gray-300 px-3 py-3 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"`
- `"mb-6 w-full rounded-lg border-2 border-gray-300 px-3 py-3 text-base placeholder:text-sm"` → `"mb-6 w-full rounded-lg border border-gray-300 px-3 py-3 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"`
- `"w-40 rounded-lg border-2 border-gray-300 px-3 py-2 text-base placeholder:text-xs"` → `"w-40 rounded-lg border border-gray-300 px-3 py-2 text-base placeholder:text-xs focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"`
- `"flex-1 rounded-lg border-2 border-gray-300 px-3 py-2 text-base"` → `"flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"`

In `app/countings/[id]/page.tsx`, the SKU-vinculação `<input>`:
```
"rounded-xl border-2 border-gray-300 px-4 py-4 text-xl"
```
becomes:
```
"rounded-xl border border-gray-300 px-4 py-4 text-xl focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
```

The "buscar caixas" `<input>`:
```
"mb-4 w-full rounded-xl border-2 border-gray-300 px-4 py-3 text-lg placeholder:text-sm"
```
becomes:
```
"mb-4 w-full rounded-xl border border-gray-300 px-4 py-3 text-lg placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
```

Do **not** touch the SKU-pendente `<form>`'s own border
(`border-2 border-accent` on the `<form>` element itself, not an `<input>`) — that's
a deliberate callout box, not a text-input field, and out of scope.

In `app/settings/page.tsx`, the `prefixLength` number `<input>`:
```
"rounded-lg border-2 border-gray-300 px-3 py-3 text-base"
```
becomes:
```
"rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
```

(Leave the `requireSku` checkbox `<input>` — `className="h-6 w-6"` — untouched; the
border/focus formula is for text-style fields, not checkboxes.)

In `app/groups/page.tsx`, the prefix `<input>`:
```
"rounded-lg border-2 border-gray-300 px-3 py-3 text-base placeholder:text-sm sm:w-40"
```
becomes:
```
"rounded-lg border border-gray-300 px-3 py-3 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none sm:w-40"
```

The group-name `<input>`:
```
"flex-1 rounded-lg border-2 border-gray-300 px-3 py-3 text-base placeholder:text-sm"
```
becomes:
```
"flex-1 rounded-lg border border-gray-300 px-3 py-3 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
```

In `app/history/page.tsx`, the "buscar histórico" `<input>`:
```
"mb-6 w-full rounded-xl border-2 border-gray-300 px-4 py-3 text-lg placeholder:text-sm"
```
becomes:
```
"mb-6 w-full rounded-xl border border-gray-300 px-4 py-3 text-lg placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
```

The clickable `Card`:
```
<Card className="relative hover:border-accent">
```
becomes:
```
<Card className="relative hover:border-accent hover:shadow-md">
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: all test files pass, 0 unhandled rejections.

- [ ] **Step 3: Run `npx tsc --noEmit` and `npm run build`**

Expected: no new type errors beyond the one pre-existing, already-deferred TS2769
pattern in `app/recompensas/clientes/page.test.tsx` (unrelated to this plan); `npm run
build` completes successfully.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/products/page.tsx "app/countings/[id]/page.tsx" app/settings/page.tsx app/groups/page.tsx app/history/page.tsx
git commit -m "style: thin borders + accent focus ring on every remaining input, plus hover elevation on clickable cards"
```

---

## After all tasks: manual verification (controller, not a subagent)

This plan is almost entirely visual — the automated suite confirms nothing broke
functionally, but not that the result actually looks better. Per this session's
established practice for CSS/visual changes, the controller opens the running app in
a real browser after all 3 tasks land and checks, at minimum:

- One office/data-entry screen (e.g. `/recompensas`): inputs show a visible colored
  ring on focus, the sales table header is light/uppercase (not a solid block), rows
  highlight on hover, the primary button has a visible soft shadow.
- One counting/scanner screen (e.g. an open counting's detail page): confirms the
  same border/focus polish applied without changing the large touch-friendly sizing,
  and that `BarcodeInput` was correctly left untouched (still has its own colored
  border).

No code changes are expected from this check unless it surfaces a real visual defect
the diff-level review couldn't catch (the same class of risk documented earlier this
session for anything touching layout/CSS).
