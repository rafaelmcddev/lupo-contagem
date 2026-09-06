import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { boxes, countings, groups, invoiceItems, scans } from '@/db/schema';
import { recordScan } from '@/lib/scanCounting';
import { resetDb } from '@/tests/resetDb';
import { DELETE, GET } from './route';

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
        { barcode: '7891234000011', sku: 'CUECA-SLIP-P', name: null, total: 1 },
        { barcode: '7891234999999', sku: 'CUECA-SLIP-M', name: null, total: 1 },
      ]),
    );
    expect(data.boxes[1]).toMatchObject({ boxNumber: 2, total: 1, groupName: null });
    expect(data.boxes[1].skuBreakdown).toEqual([{ barcode: '7899999000011', sku: 'OUTRO-SKU', name: null, total: 1 }]);
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
        { barcode: '7891234000011', sku: null, name: null, total: 1 },
        { barcode: '7891234999999', sku: 'CUECA-SLIP-M', name: null, total: 1 },
      ]),
    );
  });

  it('returns invoiceCheck as null for a manual counting', async () => {
    const [counting] = await db.insert(countings).values({ name: 'Teste', prefixLengthUsed: 7, status: 'active' }).returning();
    const res = await GET(new Request('http://localhost'), { params: { id: String(counting.id) } });
    const data = await res.json();
    expect(data.invoiceCheck).toBeNull();
  });

  it('returns invoiceCheck comparing expected vs counted for an xml-sourced counting', async () => {
    const [counting] = await db
      .insert(countings)
      .values({ name: 'NF 123', prefixLengthUsed: 7, status: 'active', source: 'xml' })
      .returning();
    await db.insert(invoiceItems).values([
      { countingId: counting.id, barcode: '7891234000011', sku: 'SKU-A', name: 'Produto A', expectedQty: 3 },
      { countingId: counting.id, barcode: '7891234000028', sku: 'SKU-B', name: 'Produto B', expectedQty: 5 },
    ]);
    await recordScan(db, counting.id, '7891234000011', 'SKU-A', new Date('2026-01-01T10:00:00Z'));
    await recordScan(db, counting.id, '7891234000011', 'SKU-A', new Date('2026-01-01T10:00:05Z'));

    const res = await GET(new Request('http://localhost'), { params: { id: String(counting.id) } });
    const data = await res.json();

    expect(data.invoiceCheck).toEqual(
      expect.arrayContaining([
        { barcode: '7891234000011', sku: 'SKU-A', name: 'Produto A', expectedQty: 3, countedQty: 2 },
        { barcode: '7891234000028', sku: 'SKU-B', name: 'Produto B', expectedQty: 5, countedQty: 0 },
      ]),
    );
  });
});

describe('DELETE /api/countings/:id', () => {
  it('returns 404 for a counting that does not exist', async () => {
    const res = await DELETE(new Request('http://localhost'), { params: { id: '999999' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-integer id instead of throwing', async () => {
    const res = await DELETE(new Request('http://localhost'), { params: { id: 'abc' } });
    expect(res.status).toBe(404);
  });

  it('deletes a counting along with its boxes and scans', async () => {
    const [counting] = await db.insert(countings).values({ name: 'Teste', prefixLengthUsed: 7, status: 'active' }).returning();
    await recordScan(db, counting.id, '7891234000011', 'CUECA-SLIP-P');
    await recordScan(db, counting.id, '7899999000011', 'OUTRO-SKU');

    const res = await DELETE(new Request('http://localhost'), { params: { id: String(counting.id) } });
    expect(res.status).toBe(200);

    const remainingCounting = await db.select().from(countings).where(eq(countings.id, counting.id));
    const remainingBoxes = await db.select().from(boxes).where(eq(boxes.countingId, counting.id));
    expect(remainingCounting).toHaveLength(0);
    expect(remainingBoxes).toHaveLength(0);

    const allScans = await db.select().from(scans);
    expect(allScans).toHaveLength(0);
  });

  it('does not affect other countings when deleting one', async () => {
    const [keep] = await db.insert(countings).values({ name: 'Manter', prefixLengthUsed: 7, status: 'active' }).returning();
    const [remove] = await db.insert(countings).values({ name: 'Remover', prefixLengthUsed: 7, status: 'active' }).returning();
    await recordScan(db, keep.id, '7891234000011', 'CUECA-SLIP-P');
    await recordScan(db, remove.id, '7899999000011', 'OUTRO-SKU');

    await DELETE(new Request('http://localhost'), { params: { id: String(remove.id) } });

    const res = await GET(new Request('http://localhost'), { params: { id: String(keep.id) } });
    const data = await res.json();
    expect(data.grandTotal).toBe(1);
  });
});
