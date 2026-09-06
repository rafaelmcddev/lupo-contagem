import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { settings, skus } from '@/db/schema';
import { REQUIRE_SKU_KEY } from '@/lib/getRequireSku';
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

  it('rejects an empty name on edit regardless of the require-SKU setting', async () => {
    await createProduct();
    const res = await PUT(
      new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ sku: 'X', name: '' }) }),
      { params: { barcode: '7891234000011' } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects an empty sku on edit when "Exigir SKU" is on (the default)', async () => {
    await createProduct();
    const res = await PUT(
      new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ sku: '', name: 'X' }) }),
      { params: { barcode: '7891234000011' } },
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('sku_required');
  });

  it('allows clearing the sku on edit when "Exigir SKU" is off', async () => {
    await createProduct();
    await db.insert(settings).values({ key: REQUIRE_SKU_KEY, value: 'false' });
    const res = await PUT(
      new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ sku: '', name: 'Sem SKU mesmo' }) }),
      { params: { barcode: '7891234000011' } },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.product).toMatchObject({ sku: null, name: 'Sem SKU mesmo' });
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
