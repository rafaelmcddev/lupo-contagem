import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/tests/resetDb';
import { db } from '@/db/client';
import { countings, settings } from '@/db/schema';
import { GET, POST } from './route';

beforeEach(resetDb);

describe('/api/countings', () => {
  it('creates a counting with the current prefix length frozen onto it', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'Entrega Lupo 03/09' }) }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.counting.name).toBe('Entrega Lupo 03/09');
    expect(data.counting.status).toBe('active');
    expect(data.counting.prefixLengthUsed).toBe(7);
    expect(data.counting.requireSkuUsed).toBe(true);
  });

  it('freezes requireSkuUsed as false when the setting was turned off before creation', async () => {
    await db.insert(settings).values({ key: 'require_sku', value: 'false' });
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'Sem SKU' }) }));
    const data = await res.json();
    expect(data.counting.requireSkuUsed).toBe(false);
  });

  it('rejects creating a counting without a name', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: '' }) }));
    expect(res.status).toBe(400);
  });

  it('lists only active countings when filtered', async () => {
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'A' }) }));
    const res = await GET(new Request('http://localhost/api/countings?status=active'));
    const data = await res.json();
    expect(data.countings).toHaveLength(1);
  });

  it('lists no finished countings when none have been finished', async () => {
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'A' }) }));
    const res = await GET(new Request('http://localhost/api/countings?status=finished'));
    const data = await res.json();
    expect(data.countings).toHaveLength(0);
  });

  it('filters by name search', async () => {
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'Entrega Lupo' }) }));
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'Contagem geral' }) }));

    const res = await GET(new Request('http://localhost/api/countings?q=lupo'));
    const data = await res.json();
    expect(data.countings).toHaveLength(1);
    expect(data.countings[0].name).toBe('Entrega Lupo');
  });

  it('paginates results and reports the total', async () => {
    for (let i = 1; i <= 3; i++) {
      await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: `Contagem ${i}` }) }));
    }
    const res = await GET(new Request('http://localhost/api/countings?pageSize=2&page=1'));
    const data = await res.json();
    expect(data.countings).toHaveLength(2);
    expect(data.total).toBe(3);
  });

  it('returns 400 invalid_json when the body is malformed', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_json');
  });
});
