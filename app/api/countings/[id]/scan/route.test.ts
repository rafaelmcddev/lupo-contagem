import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { countings } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { POST } from './route';

beforeEach(resetDb);

async function createActiveCounting() {
  const [row] = await db.insert(countings).values({ name: 'Teste', prefixLengthUsed: 7, status: 'active' }).returning();
  return row;
}

describe('/api/countings/:id/scan', () => {
  it('returns 422 sku_required for a barcode with no linked SKU, recording nothing', async () => {
    const counting = await createActiveCounting();
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '7891234000011' }) }), {
      params: { id: String(counting.id) },
    });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toBe('sku_required');
  });

  it('records a scan and returns the box hit when a SKU is provided', async () => {
    const counting = await createActiveCounting();
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '7891234000011', sku: 'CUECA-SLIP-P' }) }),
      { params: { id: String(counting.id) } },
    );
    const data = await res.json();
    expect(data.duplicate).toBe(false);
    expect(data.box.boxNumber).toBe(1);
    expect(data.box.sku).toBe('CUECA-SLIP-P');
  });

  it('returns 400 for an invalid barcode', async () => {
    const counting = await createActiveCounting();
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '12' }) }), {
      params: { id: String(counting.id) },
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a counting that does not exist', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '7891234000011' }) }), {
      params: { id: '999999' },
    });
    expect(res.status).toBe(404);
  });

  it('returns 409 when scanning into a finished counting', async () => {
    const counting = await createActiveCounting();
    await db.update(countings).set({ status: 'finished' }).where(eq(countings.id, counting.id));
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '7891234000011', sku: 'CUECA-SLIP-P' }) }),
      { params: { id: String(counting.id) } },
    );
    expect(res.status).toBe(409);
  });

  it('returns 404 for a non-integer id instead of throwing', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ barcode: '7891234000011' }) }), {
      params: { id: 'abc' },
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 invalid_json when the body is malformed', async () => {
    const counting = await createActiveCounting();
    const res = await POST(new Request('http://localhost', { method: 'POST', body: '{not json' }), {
      params: { id: String(counting.id) },
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_json');
  });

  it('accepts an original scannedAt time and uses it for dedupe instead of the request wall-clock time', async () => {
    const counting = await createActiveCounting();
    const t1 = new Date('2026-01-01T10:00:00Z').toISOString();
    const t2 = new Date('2026-01-01T10:00:02Z').toISOString();

    const res1 = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ barcode: '7891234000011', sku: 'CUECA-SLIP-P', scannedAt: t1 }),
      }),
      { params: { id: String(counting.id) } },
    );
    const data1 = await res1.json();
    expect(data1.duplicate).toBe(false);

    const res2 = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ barcode: '7891234000011', scannedAt: t2 }),
      }),
      { params: { id: String(counting.id) } },
    );
    const data2 = await res2.json();
    expect(data2.duplicate).toBe(false);
    expect(data2.box.total).toBe(2);
  });
});
