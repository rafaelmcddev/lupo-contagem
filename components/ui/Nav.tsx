'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

function getStoreIdCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)store_id=(\d+)/);
  return match ? match[1] : null;
}

const LINKS = [
  { href: '/', label: 'Início' },
  { href: '/history', label: 'Histórico' },
  { href: '/products', label: 'Produtos' },
  { href: '/groups', label: 'Grupos' },
  { href: '/recompensas', label: 'Recompensas' },
  { href: '/settings', label: 'Configurações' },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  const [storeName, setStoreName] = useState<string | null>(null);

  useEffect(() => {
    if (pathname === '/loja') return;
    const storeId = getStoreIdCookie();
    if (!storeId) return;
    fetch('/api/stores')
      .then((r) => r.json())
      .then((d) => {
        const store = (d.stores ?? []).find((s: { id: number }) => String(s.id) === storeId);
        if (store) setStoreName(store.name);
      })
      .catch(() => {});
  }, [pathname]);

  function trocarLoja() {
    document.cookie = 'store_id=; path=/; max-age=0';
    router.push('/loja');
  }

  if (pathname === '/loja') {
    return null;
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-gray-200 bg-paper">
      <ul className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-2 py-2 sm:gap-2 sm:px-4">
        {LINKS.map((link) => {
          const isActive = link.href === '/' ? pathname === '/' : pathname?.startsWith(link.href);
          return (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-accent-light text-accent' : 'text-gray-600 hover:bg-canvas hover:text-ink'
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
        {storeName && (
          <li className="ml-auto shrink-0 self-center px-2 text-sm font-medium uppercase text-gray-500">
            {storeName}
          </li>
        )}
        <li className="shrink-0">
          <button
            type="button"
            onClick={trocarLoja}
            className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-canvas hover:text-ink"
          >
            Trocar loja
          </button>
        </li>
      </ul>
    </nav>
  );
}
