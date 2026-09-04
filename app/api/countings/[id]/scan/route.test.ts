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
});
