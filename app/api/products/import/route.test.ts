import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { skus } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { POST } from './route';

let storeId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
});

function postReq(csv: string) {
  return unlockedRequest('http://localhost', storeId, { method: 'POST', body: JSON.stringify({ csv }) });
}

describe('/api/products/import', () => {
  it('returns 401 when the PIN is not unlocked', async () => {
    const res = await POST(storeRequest('http://localhost', storeId, { method: 'POST', body: JSON.stringify({ csv: '' }) }));
    expect(res.status).toBe(401);
  });

  it('creates new products from valid rows', async () => {
    const csv = 'nome;sku;codebar\nCueca Slip Preta P;CUECA-SLIP-P;7891234000011\nCueca Slip Preta M;CUECA-SLIP-M;7891234000028';
    const res = await POST(postReq(csv));
    const data = await res.json();
    expect(data.created).toBe(2);
    expect(data.updated).toBe(0);
    expect(data.errors).toEqual([]);
    const rows = await db.select().from(skus);
    expect(rows).toHaveLength(2);
  });

  it('overwrites sku and name when the barcode already exists in the same store', async () => {
    await db.insert(skus).values({ storeId, barcode: '7891234000011', sku: 'ANTIGO', name: 'Nome antigo' });
    const csv = 'nome;sku;codebar\nNome novo;NOVO-SKU;7891234000011';
    const res = await POST(postReq(csv));
    const data = await res.json();
    expect(data.created).toBe(0);
    expect(data.updated).toBe(1);
    const rows = await db.select().from(skus);
    expect(rows[0]).toMatchObject({ sku: 'NOVO-SKU', name: 'Nome novo' });
  });

  it('creates a new row instead of overwriting when the same barcode exists in a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await db.insert(skus).values({ storeId: otherStoreId, barcode: '7891234000011', sku: 'OUTRA-LOJA', name: 'Outra loja' });
    const csv = 'nome;sku;codebar\nNome novo;NOVO-SKU;7891234000011';
    const res = await POST(postReq(csv));
    const data = await res.json();
    expect(data.created).toBe(1);
    expect(data.updated).toBe(0);
    const rows = await db.select().from(skus);
    expect(rows).toHaveLength(2);
  });

  it('reports invalid rows without failing the whole import', async () => {
    const csv = 'nome;sku;codebar\nX;Y;abc\nCueca Slip Preta P;CUECA-SLIP-P;7891234000011';
    const res = await POST(postReq(csv));
    const data = await res.json();
    expect(data.created).toBe(1);
    expect(data.errors).toEqual([{ line: 2, reason: 'código de barras vazio ou não numérico' }]);
  });

  it('returns 400 invalid_csv_header for a file missing the required columns', async () => {
    const res = await POST(postReq('a;b\n1;2'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_csv_header');
  });

  it('rejects malformed JSON', async () => {
    const res = await POST(unlockedRequest('http://localhost', storeId, { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });
});
