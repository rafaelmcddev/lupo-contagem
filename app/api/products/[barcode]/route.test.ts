import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { skus } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { DELETE, PUT } from './route';

beforeEach(resetDb);

async function createProduct() {
  const [row] = await db.insert(skus).values({ barcode: '7891234000011', sku: 'CUECA-SLIP-P', name: 'Cueca Slip Preta P' }).returning();
  return row;
}

describe('/api/products/:barcode', () => {
  it('edits sku and name', async () => {
    await createProduct();
    const res = await PUT(
      new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ sku: 'NOVO-SKU', name: 'Novo nome' }) }),
      { params: { barcode: '7891234000011' } },
    );
    const data = await res.json();
    expect(data.product).toMatchObject({ sku: 'NOVO-SKU', name: 'Novo nome' });
  });

  it('returns 404 when editing a barcode that does not exist', async () => {
    const res = await PUT(
      new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ sku: 'X', name: 'X' }) }),
      { params: { barcode: '0000000000000' } },
    );
    expect(res.status).toBe(404);
  });

  it('rejects an empty sku or name on edit', async () => {
    await createProduct();
    const res = await PUT(
      new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ sku: '', name: 'X' }) }),
      { params: { barcode: '7891234000011' } },
    );
    expect(res.status).toBe(400);
  });

  it('removes a product', async () => {
    await createProduct();
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { barcode: '7891234000011' } });
    expect(res.status).toBe(200);
    const remaining = await db.select().from(skus);
    expect(remaining).toHaveLength(0);
  });

  it('returns 404 when removing a barcode that does not exist', async () => {
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { barcode: '0000000000000' } });
    expect(res.status).toBe(404);
  });
});
