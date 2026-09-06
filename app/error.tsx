'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <p className="mb-6 text-2xl font-bold text-red-600">Algo deu errado.</p>
      <button onClick={reset} className="rounded-xl bg-blue-600 px-6 py-4 text-xl font-semibold text-white">
        Tentar novamente
      </button>
    </main>
  );
}
