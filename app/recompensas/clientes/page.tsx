'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { PageHeading } from '@/components/ui/PageHeading';
import { Pagination } from '@/components/ui/Pagination';
import { Table } from '@/components/ui/Table';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { PinGate } from '@/components/PinGate';
import { hasEnoughDigits } from '@/lib/masks';

interface Customer {
  id: number;
  name: string;
  phone: string;
}

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 300;

export default function ClientesPage() {
  return (
    <PinGate>
      <ClientesContent />
    </PinGate>
  );
}

// Split out from ClientesPage so this content — and its `load()` effect —
// only mounts once PinGate has actually unlocked. See the identical split
// in app/recompensas/page.tsx for the full explanation of why wrapping
// <PinGate> around JSX in the same component isn't enough on its own.
function ClientesContent() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // Bumped after a successful add to force PhoneInput to remount and clear
  // its internal digit state — it isn't a fully controlled input, so
  // setPhone('') alone would not reset what it displays.
  const [phoneFieldKey, setPhoneFieldKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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
    if (!trimmedName || !hasEnoughDigits(phone)) {
      setFormError('Preencha nome e telefone.');
      return;
    }
    const trimmedPhone = phone.trim();
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
      setPhoneFieldKey((k) => k + 1);
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
    if (!trimmedName || !hasEnoughDigits(editPhone)) return;
    const trimmedPhone = editPhone.trim();
    setActionError(null);
    const res = await fetch(`/api/customers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmedName, phone: trimmedPhone }),
    });
    if (!res.ok) {
      setActionError('Não foi possível salvar as alterações desse cliente.');
      return;
    }
    setEditingId(null);
    load();
  }

  async function removeCustomer(id: number) {
    if (!window.confirm('Remover este cliente?')) return;
    setActionError(null);
    const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setActionError('Não foi possível remover esse cliente.');
      return;
    }
    load();
  }

  return (
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
        <PhoneInput
          key={phoneFieldKey}
          onChangeValue={setPhone}
          placeholder="Telefone"
          className="w-48 rounded-xl border-2 border-gray-300 px-4 py-4 text-xl placeholder:text-sm"
        />
        <Button type="submit" disabled={saving}>
          {saving ? 'Adicionando...' : 'Adicionar'}
        </Button>
      </form>
      {formError && <p className="mb-4 text-lg text-red-600">{formError}</p>}
      {actionError && <p className="mb-4 text-lg text-red-600">{actionError}</p>}

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
                <PhoneInput
                  initialValue={editPhone}
                  onChangeValue={setEditPhone}
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
  );
}
