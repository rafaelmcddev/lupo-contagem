'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeading } from '@/components/ui/PageHeading';
import { Pagination } from '@/components/ui/Pagination';

interface Product {
  barcode: string;
  sku: string | null;
  name: string | null;
}

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 300;

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [editingBarcode, setEditingBarcode] = useState<string | null>(null);
  const [editSku, setEditSku] = useState('');
  const [editName, setEditName] = useState('');
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      setDebouncedQuery(query);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (debouncedQuery) params.set('q', debouncedQuery);
      const res = await fetch(`/api/products?${params.toString()}`);
      const data = await res.json();
      setProducts(data.products);
      setTotal(data.total ?? data.products.length);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQuery]);

  useEffect(() => {
    load();
  }, [load]);

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    const trimmedBarcode = barcode.trim();
    const trimmedSku = sku.trim();
    const trimmedName = name.trim();
    // SKU is only mandatory when "Exigir SKU" is on in Configurações — the
    // server is the source of truth for that, so it's left to validate it;
    // barcode and name are always required regardless of that setting.
    if (!trimmedBarcode || !trimmedName) {
      setFormError('Preencha ao menos o código de barras e o nome.');
      return;
    }
    setFormError(null);
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: trimmedBarcode, sku: trimmedSku, name: trimmedName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(
          data.error === 'barcode_already_registered'
            ? 'Esse código de barras já está cadastrado.'
            : data.error === 'sku_required'
              ? 'SKU é obrigatório (a opção "Exigir SKU" está ativada em Configurações).'
              : 'Não foi possível cadastrar o produto. Tente novamente.',
        );
        return;
      }
      setBarcode('');
      setSku('');
      setName('');
      load();
    } catch {
      setFormError('Falha de conexão. Verifique sua internet e tente novamente.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function startEdit(product: Product) {
    setEditingBarcode(product.barcode);
    setEditSku(product.sku ?? '');
    setEditName(product.name ?? '');
    setEditError(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBarcode) return;
    const res = await fetch(`/api/products/${editingBarcode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: editSku.trim(), name: editName.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setEditError(
        data.error === 'sku_required'
          ? 'SKU é obrigatório (a opção "Exigir SKU" está ativada em Configurações).'
          : 'Não foi possível salvar. Preencha ao menos o nome.',
      );
      return;
    }
    setEditingBarcode(null);
    setEditError(null);
    load();
  }

  async function removeProduct(productBarcode: string) {
    if (!window.confirm('Remover este produto do catálogo?')) return;
    await fetch(`/api/products/${productBarcode}`, { method: 'DELETE' });
    load();
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const csv = await file.text();
    const res = await fetch('/api/products/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv }),
    });
    const data = await res.json();
    setImportSummary(`${data.created} criados, ${data.updated} atualizados, ${data.errors.length} ignorados`);
    e.target.value = '';
    load();
  }

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <PageHeading>Produtos</PageHeading>

      <form onSubmit={addProduct} className="mb-2 flex flex-wrap gap-4">
        <input
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          placeholder="Código de barras"
          className="w-48 rounded-xl border-2 border-gray-300 px-4 py-4 text-xl placeholder:text-sm"
        />
        <input
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="SKU"
          className="w-40 rounded-xl border-2 border-gray-300 px-4 py-4 text-xl placeholder:text-sm"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do produto"
          className="flex-1 rounded-xl border-2 border-gray-300 px-4 py-4 text-xl placeholder:text-sm"
        />
        <Button type="submit" disabled={saving}>
          {saving ? 'Adicionando...' : 'Adicionar'}
        </Button>
      </form>
      {formError ? (
        <p className="mb-4 text-lg text-red-600">{formError}</p>
      ) : (
        <p className="mb-4 text-sm text-gray-500">
          Código de barras e nome são obrigatórios. SKU só é obrigatório se "Exigir SKU" estiver ativado em
          Configurações.
        </p>
      )}

      <div className="mb-8 flex flex-col gap-2">
        <label htmlFor="csvImport" className="inline-block">
          <span className="cursor-pointer rounded-xl bg-gray-100 px-6 py-4 text-xl font-semibold text-ink hover:bg-gray-200">
            Importar CSV
          </span>
          <input id="csvImport" type="file" accept=".csv" onChange={handleImport} className="hidden" />
        </label>
        <p className="text-sm text-gray-500">O arquivo CSV deve ter as colunas nome;sku;codebar</p>
        {importSummary && <p className="text-lg text-gray-600">{importSummary}</p>}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nome, SKU ou código de barras..."
        aria-label="Buscar produtos"
        className="mb-6 w-full rounded-xl border-2 border-gray-300 px-4 py-4 text-xl placeholder:text-sm"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {products.map((p) =>
          editingBarcode === p.barcode ? (
            <Card key={p.barcode} className="sm:col-span-2">
              <form onSubmit={saveEdit} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-4">
                  <p className="text-xl font-bold">{p.barcode}</p>
                  <input
                    value={editSku}
                    onChange={(e) => setEditSku(e.target.value)}
                    placeholder="SKU (opcional se não exigido)"
                    className="w-40 rounded-xl border-2 border-gray-300 px-4 py-2 text-lg placeholder:text-xs"
                  />
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 rounded-xl border-2 border-gray-300 px-4 py-2 text-lg"
                  />
                  <Button type="submit">Salvar</Button>
                </div>
                {editError && <p className="text-base text-red-600">{editError}</p>}
              </form>
            </Card>
          ) : (
            <Card key={p.barcode} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-xl font-bold">{p.name ?? 'Sem nome'}</p>
                <p className="truncate text-sm text-gray-600">
                  <span className="font-mono">{p.sku ?? p.barcode}</span>
                  {p.sku && <span className="ml-1 font-mono text-gray-400">({p.barcode})</span>}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" onClick={() => startEdit(p)}>
                  Editar
                </Button>
                <Button variant="danger" onClick={() => removeProduct(p.barcode)}>
                  Remover
                </Button>
              </div>
            </Card>
          ),
        )}
        {!loading && products.length === 0 && (
          <p className="text-xl text-gray-500 sm:col-span-2">
            {debouncedQuery ? 'Nenhum produto encontrado para essa busca.' : 'Nenhum produto cadastrado.'}
          </p>
        )}
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </main>
  );
}
