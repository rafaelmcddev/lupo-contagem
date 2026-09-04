'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeading } from '@/components/ui/PageHeading';

interface Counting {
  id: number;
  name: string;
  startedAt: string;
}

export default function HomePage() {
  const [countings, setCountings] = useState<Counting[]>([]);
  const [name, setName] = useState('');

  async function loadActive() {
    const res = await fetch('/api/countings?status=active');
    const data = await res.json();
    setCountings(data.countings);
  }

  useEffect(() => {
    loadActive();
  }, []);

  async function createCounting(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await fetch('/api/countings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setName('');
    loadActive();
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <PageHeading>Contagem de Estoque</PageHeading>

      <form onSubmit={createCounting} className="mb-8 flex gap-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da contagem (ex: Entrega Lupo 03/09)"
          className="flex-1 rounded-xl border-2 border-gray-300 px-4 py-4 text-xl"
        />
        <Button type="submit">Iniciar contagem</Button>
      </form>

      <h2 className="mb-4 text-2xl font-semibold">Contagens abertas</h2>
      <div className="grid gap-4">
        {countings.map((c) => (
          <Link key={c.id} href={`/countings/${c.id}`}>
            <Card className="hover:border-accent">
              <p className="text-2xl font-bold">{c.name}</p>
              <p className="text-gray-500">{new Date(c.startedAt).toLocaleString('pt-BR')}</p>
            </Card>
          </Link>
        ))}
        {countings.length === 0 && <p className="text-xl text-gray-500">Nenhuma contagem aberta.</p>}
      </div>

      <div className="mt-8 flex gap-4">
        <Link href="/history">
          <Button variant="secondary">Histórico</Button>
        </Link>
        <Link href="/settings">
          <Button variant="secondary">Configurações</Button>
        </Link>
        <Link href="/groups">
          <Button variant="secondary">Grupos</Button>
        </Link>
      </div>
    </main>
  );
}
