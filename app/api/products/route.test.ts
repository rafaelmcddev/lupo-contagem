import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { settings } from '@/db/schema';
import { REQUIRE_SKU_KEY } from '@/lib/getRequireSku';
import { resetDb } from '@/tests/resetDb';
import { GET, POST } from './route';

beforeEach(resetDb);

function getReq(query = '') {
  return new Request(`http://localhost/api/products${query}`);
}

describe('/api/products', () => {
  it('starts empty', async () => {
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.products).toEqual([]);
    expect(data.total).toBe(0);
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

  it('lists created products ordered by name', async () => {
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '2', sku: 'B', name: 'Zebra' }) }));
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '1', sku: 'A', name: 'Abacaxi' }) }));
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.products.map((p: { barcode: string }) => p.barcode)).toEqual(['1', '2']);
  });

  it('filters by a search term across name, sku, and barcode', async () => {
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '7891234000011', sku: 'CUECA-SLIP-P', name: 'Cueca Slip Preta' }) }));
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '7891234000028', sku: 'SUTIA-P', name: 'Sutia Power' }) }));

    const byName = await GET(getReq('?q=cueca'));
    expect((await byName.json()).products).toHaveLength(1);

    const bySku = await GET(getReq('?q=SUTIA-P'));
    expect((await bySku.json()).products).toHaveLength(1);

    const byBarcode = await GET(getReq('?q=7891234000028'));
    expect((await byBarcode.json()).products).toHaveLength(1);

    const noMatch = await GET(getReq('?q=inexistente'));
    expect((await noMatch.json()).products).toHaveLength(0);
  });

  it('paginates results', async () => {
    for (let i = 1; i <= 5; i++) {
      await POST(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ barcode: String(i), sku: `SKU-${i}`, name: `Produto ${i}` }),
        }),
      );
    }
    const page1 = await GET(getReq('?pageSize=2&page=1'));
    const data1 = await page1.json();
    expect(data1.products).toHaveLength(2);
    expect(data1.total).toBe(5);

    const page3 = await GET(getReq('?pageSize=2&page=3'));
    const data3 = await page3.json();
    expect(data3.products).toHaveLength(1);
  });

  it('rejects a duplicate barcode', async () => {
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '1', sku: 'A', name: 'A' }) }));
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '1', sku: 'B', name: 'B' }) }),
    );
    expect(res.status).toBe(409);
  });

  it('rejects an empty barcode or name regardless of the require-SKU setting', async () => {
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '', sku: 'A', name: 'A' }) }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects an empty sku when "Exigir SKU" is on (the default)', async () => {
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '1', sku: '', name: 'A' }) }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('sku_required');
  });

  it('allows an empty sku when "Exigir SKU" is off', async () => {
    await db.insert(settings).values({ key: REQUIRE_SKU_KEY, value: 'false' });
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '78947467', sku: '', name: 'Produto qualquer' }) }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.product).toMatchObject({ barcode: '78947467', sku: null, name: 'Produto qualquer' });
  });

  it('rejects malformed JSON', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });
});
