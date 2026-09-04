'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { PageHeading } from '@/components/ui/PageHeading';

export default function SettingsPage() {
  const [prefixLength, setPrefixLength] = useState<number | ''>('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => setPrefixLength(d.prefixLength));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixLength: Number(prefixLength) }),
    });
    setSaved(true);
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <PageHeading>Configurações</PageHeading>
      <form onSubmit={save} className="flex flex-col gap-4">
        <label className="text-xl font-medium" htmlFor="prefixLength">
          Quantidade de dígitos que definem um grupo
        </label>
        <input
          id="prefixLength"
          type="number"
          min={1}
          max={20}
          value={prefixLength}
          onChange={(e) => {
            setPrefixLength(e.target.value === '' ? '' : Number(e.target.value));
            setSaved(false);
          }}
          className="rounded-xl border-2 border-gray-300 px-4 py-4 text-xl"
        />
        <Button type="submit">Salvar</Button>
        {saved && <p className="text-lg text-green-600">Salvo!</p>}
      </form>
    </main>
  );
}
