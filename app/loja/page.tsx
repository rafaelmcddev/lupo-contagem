'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

interface Store {
  id: number;
  name: string;
  slug: string;
}

export default function LojaPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);

  useEffect(() => {
    fetch('/api/stores')
      .then((r) => r.json())
      .then((d) => setStores(d.stores));
  }, []);

  function selectStore(storeId: number) {
    document.cookie = `store_id=${storeId}; path=/`;
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
            className="w-full py-8 text-2xl uppercase"
          >
            {store.name}
          </Button>
        ))}
      </div>
    </main>
  );
}
