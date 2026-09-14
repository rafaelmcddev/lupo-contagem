'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { PageHeading } from '@/components/ui/PageHeading';
import { Pagination } from '@/components/ui/Pagination';
import { Table } from '@/components/ui/Table';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
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

type SortOption = 'recent' | 'name';

const PAGE_SIZE = 20;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RecompensasPage() {
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSaleDate, setEditSaleDate] = useState('');
  const [editValueCents, setEditValueCents] = useState(0);

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

  function changeSort(next: SortOption) {
    setSort(next);
    setPage(1);
  }

  async function registerSale(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomer) {
      setFormError('Selecione um cliente.');
      return;
    }
    if (valueCents <= 0) {
      setFormError('Informe um valor válido.');
      return;
    }
    setFormError(null);
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
    await fetch(`/api/sales/${sale.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: sale.customerId, saleDate: editSaleDate, valueCents: editValueCents }),
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
            <CurrencyInput
              key={valueFieldKey}
              onChangeCents={setValueCents}
              ariaLabel="Valor da venda"
              className="w-40 rounded-xl border-2 border-gray-300 px-4 py-4 text-xl placeholder:text-sm"
            />
            <Button type="submit" disabled={saving}>
              {saving ? 'Registrando...' : 'Registrar venda'}
            </Button>
          </div>
          {formError && <p className="text-lg text-red-600">{formError}</p>}
        </form>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">Vendas lançadas</h2>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Ordenar por
            <select
              value={sort}
              onChange={(e) => changeSort(e.target.value as SortOption)}
              aria-label="Ordenar por"
              className="rounded-lg border border-gray-300 px-2 py-1"
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
                  <CurrencyInput
                    initialCents={s.valueCents}
                    onChangeCents={setEditValueCents}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1"
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
