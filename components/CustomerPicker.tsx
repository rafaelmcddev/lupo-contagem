'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { PlusIcon } from '@/components/ui/icons';
import { hasEnoughDigits } from '@/lib/masks';

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

  // This component always renders inside the sale form's own <form> — a
  // bare text input nested anywhere inside a <form> implicitly submits it
  // on Enter, regardless of intervening non-form elements. Without this,
  // pressing Enter here silently registers a sale instead of searching or
  // creating a customer.
  function interceptEnter(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  }

  function handleCreateFormKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      createCustomer();
    }
  }

  async function createCustomer() {
    const trimmedName = newName.trim();
    if (!trimmedName || !hasEnoughDigits(newPhone)) {
      setError('Preencha nome e telefone.');
      return;
    }
    const trimmedPhone = newPhone.trim();
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
        onKeyDown={interceptEnter}
        placeholder="Buscar cliente por nome ou telefone..."
        aria-label="Buscar cliente"
        className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
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
        // A plain <div>, not a <form>: this component is always used nested
        // inside the sale-registration page's own <form>, and HTML doesn't
        // allow a <form> inside a <form> — the browser's HTML parser silently
        // fixes up the markup on the server-rendered page (breaking the
        // submit button in the process), even though a nested <form> renders
        // and behaves fine in a client-only test environment that never
        // parses HTML. A single <div> with a type="button" trigger sidesteps
        // the whole class of bug regardless of where this component is used.
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4" onKeyDown={handleCreateFormKeyDown}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome do cliente"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
          />
          <PhoneInput
            onChangeValue={setNewPhone}
            placeholder="Telefone"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
          />
          <Button type="button" size="sm" icon={<PlusIcon />} onClick={createCustomer}>
            Cadastrar e selecionar
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
