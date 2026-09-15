'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

function getCookieValue(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=(\\d+)`));
  return match ? match[1] : null;
}

export function MasterPasswordGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setUnlocked(getCookieValue('settings_master_ok') === '1');
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/master-password/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError('Senha incorreta.');
        return;
      }
      document.cookie = 'settings_master_ok=1; path=/; max-age=31536000; samesite=lax';
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
        <h1 className="text-2xl font-semibold">Digite a senha master</h1>
        <p className="text-center text-sm text-gray-600">
          As Configurações afetam todas as vendas e mensagens enviadas — só quem tem a senha master pode alterá-las.
        </p>
        <form onSubmit={submit} className="flex w-full flex-col gap-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha master"
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none"
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
