'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { PageHeading } from '@/components/ui/PageHeading';
import { Pagination } from '@/components/ui/Pagination';

interface Counting {
  id: number;
  name: string;
  finishedAt: string;
}

const PAGE_SIZE = 10;

export default function HistoryPage() {
  const [countings, setCountings] = useState<Counting[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  function load() {
    const params = new URLSearchParams({ status: 'finished', page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedQuery) params.set('q', debouncedQuery);
    fetch(`/api/countings?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setCountings(d.countings);
        setTotal(d.total ?? d.countings.length);
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedQuery]);

  async function handleDelete(e: React.MouseEvent, id: number, label: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Excluir a contagem "${label}"? Essa ação não pode ser desfeita.`)) return;
    await fetch(`/api/countings/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <PageHeading>Histórico</PageHeading>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar contagem pelo nome..."
        aria-label="Buscar histórico"
        className="mb-6 w-full rounded-xl border-2 border-gray-300 px-4 py-3 text-lg placeholder:text-sm"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {countings.map((c) => (
          <Link key={c.id} href={`/countings/${c.id}`}>
            <Card className="relative hover:border-accent">
              <button
                type="button"
                aria-label={`Excluir contagem ${c.name}`}
                onClick={(e) => handleDelete(e, c.id, c.name)}
                className="absolute right-4 top-4 rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
              >
                🗑
              </button>
              <p className="truncate pr-10 text-2xl font-bold">{c.name}</p>
              <p className="text-gray-500">{new Date(c.finishedAt).toLocaleString('pt-BR')}</p>
            </Card>
          </Link>
        ))}
        {countings.length === 0 && (
          <p className="text-xl text-gray-500 sm:col-span-2">
            {debouncedQuery ? 'Nenhuma contagem encontrada.' : 'Nenhuma contagem finalizada ainda.'}
          </p>
        )}
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </main>
  );
}
