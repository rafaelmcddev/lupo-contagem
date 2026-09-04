import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/tests/resetDb';
import { GET, POST } from './route';

beforeEach(resetDb);

describe('/api/products', () => {
  it('starts empty', async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.products).toEqual([]);
  });

  it('creates a product', async () => {
    const res = await POST(
      new Request('http://localhost/api/products', {
        method: 'POST',
        body: JSON.stringify({ barcode: '7891234000011', sku: 'CUECA-SLIP-P', name: 'Cueca Slip Preta P' }),
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.product).toMatchObject({ barcode: '7891234000011', sku: 'CUECA-SLIP-P', name: 'Cueca Slip Preta P' });
  });

  it('lists created products ordered by barcode', async () => {
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '2', sku: 'B', name: 'B' }) }));
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '1', sku: 'A', name: 'A' }) }));
    const res = await GET();
    const data = await res.json();
    expect(data.products.map((p: { barcode: string }) => p.barcode)).toEqual(['1', '2']);
  });

  it('rejects a duplicate barcode', async () => {
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '1', sku: 'A', name: 'A' }) }));
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '1', sku: 'B', name: 'B' }) }),
    );
    expect(res.status).toBe(409);
  });

  it('rejects an empty barcode, sku, or name', async () => {
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '', sku: 'A', name: 'A' }) }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });
});
