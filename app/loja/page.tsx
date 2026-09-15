'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

interface Store {
  id: number;
  name: string;
  slug: string;
}

// The stored name (e.g. "Loja Up - Jardim dos Estados (Campo Grande-MS)")
// is the full name used elsewhere (nav badge, WhatsApp messages) — on this
// button-only picker screen, "Loja" is redundant on every single button,
// and the city names are shortened just to keep the label scannable.
function pickerLabel(name: string): string {
  return name
    .replace(/^loja\s+/i, '')
    .replace(/campo grande-ms/i, 'CGR')
    .replace(/coxim-ms/i, 'Coxim');
}

// Groups Coxim's stores first, then Campo Grande's — the API already
// returns each group alphabetically, and Array#sort is stable, so that
// order is preserved within each group.
function byCity(a: Store, b: Store): number {
  const rank = (s: Store) => (/coxim/i.test(s.name) ? 0 : 1);
  return rank(a) - rank(b);
}

export default function LojaPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);

  useEffect(() => {
    fetch('/api/stores')
      .then((r) => r.json())
      .then((d) => setStores([...(d.stores ?? [])].sort(byCity)));
  }, []);

  function selectStore(storeId: number) {
    document.cookie = `store_id=${storeId}; path=/; max-age=31536000; samesite=lax`;
    router.push('/');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Selecione a loja</h1>
      <div className="flex w-full flex-col gap-4">
        {stores.map((store) => (
          <Button
            key={store.id}
            variant="secondary"
            onClick={() => selectStore(store.id)}
            className="w-full rounded-2xl border-gray-200 bg-paper py-5 text-lg shadow-sm hover:bg-canvas"
          >
            {pickerLabel(store.name)}
          </Button>
        ))}
      </div>
    </main>
  );
}
