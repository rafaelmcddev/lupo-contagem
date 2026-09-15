'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

// Deliberately never cached (no cookie, no storage) — the same computer is
// shared by the store owner and staff, so the password must be re-typed on
// every visit. The verified password lives only in this component's state
// (reset the moment it unmounts, e.g. on navigating away) and is handed to
// `children` so callers can resend it with requests that need it (see
// SettingsContent's save call).
export function MasterPasswordGate({ children }: { children: (password: string) => React.ReactNode }) {
  const [verifiedPassword, setVerifiedPassword] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      setVerifiedPassword(password);
    } finally {
      setSubmitting(false);
    }
  }

  if (verifiedPassword === null) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center gap-4 p-4">
        <h1 className="text-2xl font-semibold">Digite a senha master</h1>
        <p className="text-center text-sm text-gray-600">
          As Configurações afetam todas as vendas e mensagens enviadas — só quem tem a senha master pode alterá-las.
          Ela é pedida sempre, sem ficar salva neste computador.
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

  return <>{children(verifiedPassword)}</>;
}
