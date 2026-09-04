import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { countings, groups } from '@/db/schema';
import { recordScan } from '@/lib/scanCounting';
import { resetDb } from '@/tests/resetDb';
import { GET } from './route';

beforeEach(resetDb);

describe('/api/countings/:id', () => {
  it('returns 404 for a counting that does not exist', async () => {
    const res = await GET(new Request('http://localhost'), { params: { id: '999999' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-integer id instead of throwing', async () => {
    const res = await GET(new Request('http://localhost'), { params: { id: 'abc' } });
    expect(res.status).toBe(404);
  });

  it('returns boxes with totals, SKU breakdown, and the grand total', async () => {
    const [counting] = await db.insert(countings).values({ name: 'Teste', prefixLengthUsed: 7, status: 'active' }).returning();
    await recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P');
    await recordScan(db, counting.id, '7891234999999', 'CUECA-SLIP-M');
    await recordScan(db, counting.id, '7899999000011', 'OUTRO-SKU');

    const res = await GET(new Request('http://localhost'), { params: { id: String(counting.id) } });
    const data = await res.json();

    expect(data.boxes).toHaveLength(2);
    expect(data.boxes[0]).toMatchObject({ boxNumber: 1, total: 2, groupName: null });
    expect(data.boxes[0].skuBreakdown).toEqual(
      expect.arrayContaining([
        { sku: 'CUECA-SLIP-P', total: 1 },
        { sku: 'CUECA-SLIP-M', total: 1 },
      ]),
    );
    expect(data.boxes[1]).toMatchObject({ boxNumber: 2, total: 1, groupName: null });
    expect(data.boxes[1].skuBreakdown).toEqual([{ sku: 'OUTRO-SKU', total: 1 }]);
    expect(data.grandTotal).toBe(3);
  });

  it('includes the registered group name for a matching box', async () => {
    await db.insert(groups).values({ prefix: '789123', name: 'Cueca Slip Preta' });
    const [counting] = await db.insert(countings).values({ name: 'Teste', prefixLengthUsed: 7, status: 'active' }).returning();
    await recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P');

    const res = await GET(new Request('http://localhost'), { params: { id: String(counting.id) } });
    const data = await res.json();
    expect(data.boxes[0].groupName).toBe('Cueca Slip Preta');
  });

  it('shows a "Sem SKU" entry for a scan with no linked SKU when requireSkuUsed is false', async () => {
    const [counting] = await db
      .insert(countings)
      .values({ name: 'Teste', prefixLengthUsed: 7, requireSkuUsed: false, status: 'active' })
      .returning();
    await recordScan(db, counting.id, '7891234000011'); // no sku provided, none linked -> null
    await recordScan(db, counting.id, '7891234999999', 'CUECA-SLIP-M'); // same box, has a sku

    const res = await GET(new Request('http://localhost'), { params: { id: String(counting.id) } });
    const data = await res.json();

    expect(data.boxes).toHaveLength(1);
    expect(data.boxes[0].total).toBe(2);
    expect(data.boxes[0].skuBreakdown).toEqual(
      expect.arrayContaining([
        { sku: null, total: 1 },
        { sku: 'CUECA-SLIP-M', total: 1 },
      ]),
    );
  });
});
