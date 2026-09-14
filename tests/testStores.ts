import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { stores } from '@/db/schema';

export type StoreSlug = 'coxim-ms' | 'campo-grande-ms';

export async function getTestStoreId(slug: StoreSlug = 'coxim-ms'): Promise<number> {
  const [store] = await db.select().from(stores).where(eq(stores.slug, slug)).limit(1);
  if (!store) {
    throw new Error(`Loja de teste "${slug}" não encontrada — confira se a migração de seed rodou (db/migrations).`);
  }
  return store.id;
}

export function storeRequest(url: string, storeId: number, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  const existing = headers.get('cookie');
  headers.set('cookie', existing ? `${existing}; store_id=${storeId}` : `store_id=${storeId}`);
  return new Request(url, { ...init, headers });
}
