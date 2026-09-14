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
  const [cleanupCount, setCleanupCount] = useState(0);
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

  const loadCleanupCount = useCallback(async () => {
    const res = await fetch('/api/rewards/cleanup-expired-count');
    const data = await res.json();
    setCleanupCount(data.count ?? 0);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadCleanupLog();
  }, [loadCleanupLog]);

  useEffect(() => {
    loadCleanupCount();
  }, [loadCleanupCount]);

  async function runCleanup() {
    if (
      !window.confirm(
        `Isso vai apagar permanentemente ${cleanupCount} venda(s) com cashback já vencido (mais de 30 dias). Essa ação não pode ser desfeita. Confirmar?`,
      )
    ) {
      return;
    }
    setCleaning(true);
    try {
      const res = await fetch('/api/rewards/cleanup-expired', { method: 'POST' });
      if (res.ok) {
        load();
        loadCleanupLog();
        loadCleanupCount();
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
