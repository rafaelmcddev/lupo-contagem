'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeading } from '@/components/ui/PageHeading';

interface Product {
  barcode: string;
  sku: string;
  name: string | null;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [barcode, setBarcode] = useState('');
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [editingBarcode, setEditingBarcode] = useState<string | null>(null);
  const [editSku, setEditSku] = useState('');
  const [editName, setEditName] = useState('');
  const [importSummary, setImportSummary] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/products');
    const data = await res.json();
    setProducts(data.products);
  }

  useEffect(() => {
    load();
  }, []);

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!barcode.trim() || !sku.trim() || !name.trim()) return;
    await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode, sku, name }),
    });
    setBarcode('');
    setSku('');
    setName('');
    load();
  }

  function startEdit(product: Product) {
    setEditingBarcode(product.barcode);
    setEditSku(product.sku);
    setEditName(product.name ?? '');
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBarcode) return;
    await fetch(`/api/products/${editingBarcode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: editSku, name: editName }),
    });
    setEditingBarcode(null);
    load();
  }

  async function removeProduct(productBarcode: string) {
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
    <main className="mx-auto max-w-3xl p-8">
      <PageHeading>Produtos</PageHeading>

      <form onSubmit={addProduct} className="mb-4 flex flex-wrap gap-4">
        <input
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          placeholder="Código de barras"
          className="w-48 rounded-xl border-2 border-gray-300 px-4 py-4 text-xl"
        />
        <input
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="SKU"
          className="w-40 rounded-xl border-2 border-gray-300 px-4 py-4 text-xl"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do produto"
          className="flex-1 rounded-xl border-2 border-gray-300 px-4 py-4 text-xl"
        />
        <Button type="submit">Adicionar</Button>
      </form>

      <div className="mb-8 flex flex-col gap-2">
        <label htmlFor="csvImport" className="inline-block">
          <span className="cursor-pointer rounded-xl bg-gray-100 px-6 py-4 text-xl font-semibold text-ink hover:bg-gray-200">
            Importar CSV
          </span>
          <input id="csvImport" type="file" accept=".csv" onChange={handleImport} className="hidden" />
        </label>
        {importSummary && <p className="text-lg text-gray-600">{importSummary}</p>}
      </div>

      <div className="grid gap-4">
        {products.map((p) =>
          editingBarcode === p.barcode ? (
            <Card key={p.barcode}>
              <form onSubmit={saveEdit} className="flex flex-wrap items-center gap-4">
                <p className="text-xl font-bold">{p.barcode}</p>
                <input
                  value={editSku}
                  onChange={(e) => setEditSku(e.target.value)}
                  className="w-40 rounded-xl border-2 border-gray-300 px-4 py-2 text-lg"
                />
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 rounded-xl border-2 border-gray-300 px-4 py-2 text-lg"
                />
                <Button type="submit">Salvar</Button>
              </form>
            </Card>
          ) : (
            <Card key={p.barcode} className="flex items-center justify-between">
              <div>
                <p className="text-xl font-bold">{p.barcode}</p>
                <p className="text-lg text-gray-600">
                  <span>{p.sku}</span> — <span>{p.name ?? 'Sem nome'}</span>
                </p>
              </div>
              <div className="flex gap-2">
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
      </div>
    </main>
  );
}
