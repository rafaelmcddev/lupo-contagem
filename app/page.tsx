'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeading } from '@/components/ui/PageHeading';
import { Pagination } from '@/components/ui/Pagination';

interface Counting {
  id: number;
  name: string;
  startedAt: string;
}

const PAGE_SIZE = 10;

export default function HomePage() {
  const router = useRouter();
  const [countings, setCountings] = useState<Counting[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  async function loadActive() {
    const params = new URLSearchParams({ status: 'active', page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedQuery) params.set('q', debouncedQuery);
    const res = await fetch(`/api/countings?${params.toString()}`);
    const data = await res.json();
    setCountings(data.countings);
    setTotal(data.total ?? data.countings.length);
  }

  async function handleDelete(e: React.MouseEvent, id: number, label: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Excluir a contagem "${label}"? Essa ação não pode ser desfeita.`)) return;
    await fetch(`/api/countings/${id}`, { method: 'DELETE' });
    loadActive();
  }

  useEffect(() => {
    loadActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedQuery]);

  async function createCounting(e: React.FormEvent) {
    e.preventDefault();
    // Guards against double-submit (e.g. a fast double-tap on mobile, which
    // otherwise fires two POSTs before the first response updates state and
    // disables the button) creating two identical countings.
    if (creatingRef.current) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      await fetch('/api/countings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      setName('');
      loadActive();
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  async function handleXmlSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    setImporting(true);
    try {
      const xml = await file.text();
      const res = await fetch('/api/countings/import-xml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.message || 'Não foi possível importar esse XML. Verifique se é uma NF-e válida.');
        return;
      }
      router.push(`/countings/${data.counting.id}`);
    } catch {
      setImportError('Falha ao ler o arquivo. Tente novamente.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <PageHeading>Contagem de Estoque</PageHeading>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row">
        <form onSubmit={createCounting} className="flex flex-1 flex-col gap-4 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da contagem (ex: contagem geral da loja)"
            className="flex-1 rounded-xl border-2 border-gray-300 px-4 py-4 text-xl placeholder:text-sm"
          />
          <Button type="submit" disabled={creating}>
            {creating ? 'Criando...' : 'Contagem manual'}
          </Button>
        </form>
        <Button
          type="button"
          variant="secondary"
          disabled={importing}
          onClick={() => fileInputRef.current?.click()}
        >
          {importing ? 'Importando...' : 'Importar XML da nota'}
        </Button>
        <input ref={fileInputRef} type="file" accept=".xml,text/xml" className="hidden" onChange={handleXmlSelected} />
      </div>
      {importError && <p className="mb-8 -mt-4 text-lg text-red-600">{importError}</p>}

      <h2 className="mb-4 text-2xl font-semibold">Contagens abertas</h2>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar contagem pelo nome..."
        aria-label="Buscar contagens abertas"
        className="mb-4 w-full rounded-xl border-2 border-gray-300 px-4 py-3 text-lg placeholder:text-sm"
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
              <p className="text-gray-500">{new Date(c.startedAt).toLocaleString('pt-BR')}</p>
            </Card>
          </Link>
        ))}
        {countings.length === 0 && (
          <p className="text-xl text-gray-500 sm:col-span-2">
            {debouncedQuery ? 'Nenhuma contagem encontrada.' : 'Nenhuma contagem aberta.'}
          </p>
        )}
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </main>
  );
}
