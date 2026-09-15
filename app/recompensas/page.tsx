'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { LinkButton } from '@/components/ui/LinkButton';
import { PageHeading } from '@/components/ui/PageHeading';
import { Pagination } from '@/components/ui/Pagination';
import { Table } from '@/components/ui/Table';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { CustomerPicker } from '@/components/CustomerPicker';
import { PinGate } from '@/components/PinGate';
import { ChartIcon, CheckIcon, PencilIcon, PlusIcon, SendIcon, TrashIcon, UsersIcon, XIcon } from '@/components/ui/icons';
import { formatCentsAsBRL } from '@/lib/currency';
import { formatDateBR, todayIso } from '@/lib/dates';
import { calculateRewardCents } from '@/lib/rewards';

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
  cashbackUsed: boolean;
}

type SortOption = 'recent' | 'name';

const PAGE_SIZE = 20;

export default function RecompensasPage() {
  return (
    <PinGate>
      <RecompensasContent />
    </PinGate>
  );
}

// Split out from RecompensasPage so this content — and its `load()` effect
// — only mounts once PinGate has actually unlocked. A single component
// wrapping itself in <PinGate> still runs all of its own hooks (including
// the initial-load effect) on first mount regardless of PinGate's internal
// unlocked state, since PinGate only controls whether the JSX it's handed
// as `children` gets rendered — not when the parent's own hooks fire. That
// left the list permanently empty after a correct PIN entry, until a
// manual page reload.
function RecompensasContent() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortOption>('recent');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [saleDate, setSaleDate] = useState(todayIso());
  const [valueCents, setValueCents] = useState(0);
  // Bumped after a successful submit to force CurrencyInput to remount and
  // clear its internal digit state — see the same pattern in ClientesPage.
  const [valueFieldKey, setValueFieldKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSaleDate, setEditSaleDate] = useState('');
  const [editValueCents, setEditValueCents] = useState(0);
  const [pending, setPending] = useState<Array<{ saleId: number; type: 'purchase' | 'reminder'; customerName: string; whatsappUrl: string }>>([]);
  const [processingPending, setProcessingPending] = useState(false);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort });
    const res = await fetch(`/api/sales?${params.toString()}`);
    const data = await res.json();
    setSales(data.sales ?? []);
    setTotal(data.total ?? 0);
  }, [page, sort]);

  useEffect(() => {
    load();
  }, [load]);

  const loadPending = useCallback(async () => {
    const res = await fetch('/api/whatsapp/pending');
    const data = await res.json();
    setPending(data.pending ?? []);
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  function changeSort(next: SortOption) {
    setSort(next);
    setPage(1);
  }

  async function registerSale(e: React.FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    if (!selectedCustomer) {
      setFormError('Selecione um cliente.');
      return;
    }
    if (valueCents <= 0) {
      setFormError('Informe um valor válido.');
      return;
    }
    setFormError(null);
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: selectedCustomer.id, saleDate, valueCents }),
      });
      if (!res.ok) {
        setFormError('Não foi possível registrar a venda.');
        return;
      }
      setSelectedCustomer(null);
      setSaleDate(todayIso());
      setValueCents(0);
      setValueFieldKey((k) => k + 1);
      setPage(1);
      load();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function startEdit(sale: Sale) {
    setEditingId(sale.id);
    setEditSaleDate(sale.saleDate);
    setEditValueCents(sale.valueCents);
  }

  async function saveEdit(sale: Sale) {
    if (editValueCents <= 0) return;
    setActionError(null);
    const res = await fetch(`/api/sales/${sale.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: sale.customerId, saleDate: editSaleDate, valueCents: editValueCents }),
    });
    if (!res.ok) {
      setActionError('Não foi possível salvar as alterações dessa venda.');
      return;
    }
    setEditingId(null);
    load();
  }

  async function removeSale(id: number) {
    if (!window.confirm('Remover esta venda?')) return;
    setActionError(null);
    const res = await fetch(`/api/sales/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setActionError('Não foi possível remover essa venda.');
      return;
    }
    load();
  }

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

  async function sendReminder(sale: Sale) {
    setActionError(null);
    const res = await fetch(`/api/sales/${sale.id}/send-reminder`, { method: 'POST' });
    if (!res.ok) {
      setActionError('Não foi possível preparar o lembrete dessa venda.');
      return;
    }
    const data = await res.json();
    window.open(data.whatsappUrl, '_blank');
    // The manual send just logged a whatsapp_sends row for this sale, which
    // may be exactly what the pending queue's "N mensagens pendentes" count
    // was waiting on — refresh it so the banner doesn't keep showing a
    // now-stale count until the next full page reload.
    loadPending();
  }

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <PageHeading>Recompensas</PageHeading>
        <div className="flex gap-2">
          <LinkButton href="/recompensas/relatorio" size="sm" icon={<ChartIcon />}>
            Relatório de vencimentos
          </LinkButton>
          <LinkButton href="/recompensas/clientes" size="sm" icon={<UsersIcon />}>
            Gerenciar clientes
          </LinkButton>
        </div>
      </div>

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

        <div className="flex flex-wrap items-center gap-4">
          <input
            type="date"
            value={saleDate}
            onChange={(e) => setSaleDate(e.target.value)}
            aria-label="Data da venda"
            className="rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none"
          />
          <CurrencyInput
            key={valueFieldKey}
            onChangeCents={setValueCents}
            ariaLabel="Valor da venda"
            className="w-40 rounded-lg border border-gray-300 px-3 py-3 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none"
          />
          {valueCents > 0 && (
            <span className="text-sm text-gray-600">
              Recompensa: <span className="font-semibold text-accent">{formatCentsAsBRL(calculateRewardCents(valueCents))}</span>
            </span>
          )}
          <Button type="submit" size="sm" icon={<PlusIcon />} disabled={saving}>
            {saving ? 'Registrando...' : 'Registrar venda'}
          </Button>
        </div>
        {formError && <p className="text-lg text-red-600">{formError}</p>}
      </form>

      {actionError && <p className="mb-4 text-lg text-red-600">{actionError}</p>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Vendas lançadas</h2>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Ordenar por
          <select
            value={sort}
            onChange={(e) => changeSort(e.target.value as SortOption)}
            aria-label="Ordenar por"
            className="rounded-lg border border-gray-300 px-2 py-1 focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none"
          >
            <option value="recent">Mais recente</option>
            <option value="name">Cliente (A-Z)</option>
          </select>
        </label>
      </div>
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
                  className="w-full rounded-lg border border-gray-300 px-2 py-1 focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none"
                />
              ) : (
                formatDateBR(s.saleDate)
              ),
          },
          { header: 'Cliente', render: (s: Sale) => s.customerName },
          {
            header: 'Valor',
            render: (s: Sale) =>
              editingId === s.id ? (
                <CurrencyInput
                  initialCents={s.valueCents}
                  onChangeCents={setEditValueCents}
                  className="w-full rounded-lg border border-gray-300 px-2 py-1 focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none"
                />
              ) : (
                formatCentsAsBRL(s.valueCents)
              ),
          },
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
                iconOnly
                variant={s.cashbackUsed ? 'secondary' : 'primary'}
                icon={s.cashbackUsed ? <XIcon /> : <CheckIcon />}
                aria-label={s.cashbackUsed ? 'Desmarcar' : 'Marcar como usado'}
                onClick={() => toggleCashbackUsed(s)}
              >
                {s.cashbackUsed ? 'Desmarcar' : 'Marcar como usado'}
              </Button>,
          },
          {
            header: 'Ações',
            render: (s: Sale) =>
              editingId === s.id ? (
                <div className="flex gap-2">
                  <Button type="button" size="sm" iconOnly icon={<CheckIcon />} aria-label="Salvar" onClick={() => saveEdit(s)}>
                    Salvar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    iconOnly
                    variant="secondary"
                    icon={<XIcon />}
                    aria-label="Cancelar"
                    onClick={() => setEditingId(null)}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    iconOnly
                    variant="secondary"
                    icon={<PencilIcon />}
                    aria-label="Editar"
                    onClick={() => startEdit(s)}
                  >
                    Editar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    iconOnly
                    variant="secondary"
                    icon={<SendIcon />}
                    aria-label="Enviar lembrete"
                    onClick={() => sendReminder(s)}
                  >
                    Enviar lembrete
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    iconOnly
                    variant="danger"
                    icon={<TrashIcon />}
                    aria-label="Remover"
                    onClick={() => removeSale(s.id)}
                  >
                    Remover
                  </Button>
                </div>
              ),
          },
        ]}
        rows={sales}
        emptyMessage="Nenhuma venda lançada ainda."
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </main>
  );
}
