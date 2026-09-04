'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeading } from '@/components/ui/PageHeading';

interface Group {
  id: number;
  prefix: string;
  name: string;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [prefix, setPrefix] = useState('');
  const [name, setName] = useState('');

  async function load() {
    const res = await fetch('/api/groups');
    const data = await res.json();
    setGroups(data.groups);
  }

  useEffect(() => {
    load();
  }, []);

  async function addGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!prefix.trim() || !name.trim()) return;
    await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, name }),
    });
    setPrefix('');
    setName('');
    load();
  }

  async function removeGroup(id: number) {
    await fetch(`/api/groups/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <PageHeading>Grupos</PageHeading>
      <form onSubmit={addGroup} className="mb-8 flex gap-4">
        <input
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="Prefixo"
          className="w-40 rounded-xl border-2 border-gray-300 px-4 py-4 text-xl"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do grupo"
          className="flex-1 rounded-xl border-2 border-gray-300 px-4 py-4 text-xl"
        />
        <Button type="submit">Adicionar</Button>
      </form>
      <div className="grid gap-4">
        {groups.map((g) => (
          <Card key={g.id} className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold">{g.prefix}</p>
              <p className="text-lg text-gray-600">{g.name}</p>
            </div>
            <Button variant="danger" onClick={() => removeGroup(g.id)}>
              Remover
            </Button>
          </Card>
        ))}
      </div>
    </main>
  );
}
