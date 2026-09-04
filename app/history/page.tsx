'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { PageHeading } from '@/components/ui/PageHeading';

interface Counting {
  id: number;
  name: string;
  finishedAt: string;
}

export default function HistoryPage() {
  const [countings, setCountings] = useState<Counting[]>([]);

  useEffect(() => {
    fetch('/api/countings?status=finished')
      .then((r) => r.json())
      .then((d) => setCountings(d.countings));
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <PageHeading>Histórico</PageHeading>
      <div className="grid gap-4">
        {countings.map((c) => (
          <Link key={c.id} href={`/countings/${c.id}`}>
            <Card className="hover:border-accent">
              <p className="text-2xl font-bold">{c.name}</p>
              <p className="text-gray-500">{new Date(c.finishedAt).toLocaleString('pt-BR')}</p>
            </Card>
          </Link>
        ))}
        {countings.length === 0 && <p className="text-xl text-gray-500">Nenhuma contagem finalizada ainda.</p>}
      </div>
    </main>
  );
}
