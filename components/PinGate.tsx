'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

function getCookieValue(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=(\\d+)`));
  return match ? match[1] : null;
}

export function PinGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const storeId = getCookieValue('store_id');
    const salePinOk = getCookieValue('sale_pin_ok');
    setUnlocked(storeId !== null && storeId === salePinOk);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/sale-pin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        setError('PIN incorreto.');
        return;
      }
      const storeId = getCookieValue('store_id');
      document.cookie = `sale_pin_ok=${storeId}; path=/; max-age=31536000; samesite=lax`;
      setUnlocked(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (unlocked === null) {
    return null;
  }

  if (!unlocked) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center gap-4 p-4">
        <h1 className="text-2xl font-semibold">Digite o PIN da loja</h1>
        <form onSubmit={submit} className="flex w-full flex-col gap-4">
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
          />
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? 'Verificando...' : 'Entrar'}
          </Button>
          {error && <p className="text-lg text-red-600">{error}</p>}
        </form>
      </main>
    );
  }

  return <>{children}</>;
}
