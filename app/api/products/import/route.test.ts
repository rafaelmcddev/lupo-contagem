import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { skus } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { POST } from './route';

beforeEach(resetDb);

describe('/api/products/import', () => {
  it('creates new products from valid rows', async () => {
    const csv = 'nome;sku;codebar\nCueca Slip Preta P;CUECA-SLIP-P;7891234000011\nCueca Slip Preta M;CUECA-SLIP-M;7891234000028';
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ csv }) }));
    const data = await res.json();
    expect(data.created).toBe(2);
    expect(data.updated).toBe(0);
    expect(data.errors).toEqual([]);
    const rows = await db.select().from(skus);
    expect(rows).toHaveLength(2);
  });

  it('overwrites sku and name when the barcode already exists', async () => {
    await db.insert(skus).values({ barcode: '7891234000011', sku: 'ANTIGO', name: 'Nome antigo' });
    const csv = 'nome;sku;codebar\nNome novo;NOVO-SKU;7891234000011';
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ csv }) }));
    const data = await res.json();
    expect(data.created).toBe(0);
    expect(data.updated).toBe(1);
    const rows = await db.select().from(skus);
    expect(rows[0]).toMatchObject({ sku: 'NOVO-SKU', name: 'Nome novo' });
  });

  it('reports invalid rows without failing the whole import', async () => {
    const csv = 'nome;sku;codebar\nX;Y;abc\nCueca Slip Preta P;CUECA-SLIP-P;7891234000011';
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ csv }) }));
    const data = await res.json();
    expect(data.created).toBe(1);
    expect(data.errors).toEqual([{ line: 2, reason: 'código de barras vazio ou não numérico' }]);
  });

  it('returns 400 invalid_csv_header for a file missing the required columns', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ csv: 'a;b\n1;2' }) }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_csv_header');
  });

  it('rejects malformed JSON', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });
});
