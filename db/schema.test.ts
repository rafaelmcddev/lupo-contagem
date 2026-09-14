import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './client';
import { boxes, cashbackCleanupLog, countings, customers, groups, sales, scans, settings, skus, stores, whatsappSends } from './schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId } from '@/tests/testStores';

describe('schema', () => {
  let storeId: number;

  beforeEach(async () => {
    await resetDb();
    storeId = await getTestStoreId();
  });

  it('seeds the two known stores and enforces a unique slug', async () => {
    const rows = await db.select().from(stores);
    expect(rows.map((s) => s.slug).sort()).toEqual(['campo-grande-ms', 'coxim-ms']);
    await expect(db.insert(stores).values({ name: 'Outra', slug: 'coxim-ms' })).rejects.toThrow();
  });

  it('can insert a counting, a box and a scan, and enforces the unique prefix per counting', async () => {
    const [counting] = await db
      .insert(countings)
      .values({ storeId, name: 'Teste', prefixLengthUsed: 7, status: 'active' })
      .returning();

    const [box] = await db
      .insert(boxes)
      .values({ countingId: counting.id, boxNumber: 1, prefix: '7891234' })
      .returning();

    await db.insert(scans).values({ boxId: box.id, barcode: '7891234000011' });

    const found = await db.select().from(countings).where(eq(countings.id, counting.id));
    expect(found[0].name).toBe('Teste');
    expect(found[0].requireSkuUsed).toBe(true);

    await expect(
      db.insert(boxes).values({ countingId: counting.id, boxNumber: 2, prefix: '7891234' }),
    ).rejects.toThrow();
  });

  it('can create a counting with requireSkuUsed explicitly false', async () => {
    const [counting] = await db
      .insert(countings)
      .values({ storeId, name: 'Teste', prefixLengthUsed: 7, requireSkuUsed: false, status: 'active' })
      .returning();
    expect(counting.requireSkuUsed).toBe(false);
  });

  it('enforces a unique prefix on groups per store, but allows the same prefix in a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await db.insert(groups).values({ storeId, prefix: '789123', name: 'Cueca Slip Preta' });
    await expect(
      db.insert(groups).values({ storeId, prefix: '789123', name: 'Outro nome' }),
    ).rejects.toThrow();
    await expect(
      db.insert(groups).values({ storeId: otherStoreId, prefix: '789123', name: 'Mesmo prefixo, outra loja' }),
    ).resolves.toBeDefined();
  });

  it('can upsert a setting by key', async () => {
    await db.insert(settings).values({ key: 'prefix_length', value: '7' });
    await db
      .insert(settings)
      .values({ key: 'prefix_length', value: '8' })
      .onConflictDoUpdate({ target: settings.key, set: { value: '8' } });
    const row = await db.select().from(settings).where(eq(settings.key, 'prefix_length'));
    expect(row[0].value).toBe('8');
  });

  it('links an exact barcode to a SKU per store, with an optional name', async () => {
    await db.insert(skus).values({ storeId, barcode: '7891234000011', sku: 'CUECA-SLIP-P' });
    const row = await db.select().from(skus).where(eq(skus.barcode, '7891234000011'));
    expect(row[0].sku).toBe('CUECA-SLIP-P');
    expect(row[0].name).toBeNull();

    await expect(
      db.insert(skus).values({ storeId, barcode: '7891234000011', sku: 'OUTRO-SKU' }),
    ).rejects.toThrow();
  });

  it('allows the same barcode to exist independently in two different stores', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    await db.insert(skus).values({ storeId, barcode: '7891234000011', sku: 'LOJA-COXIM' });
    await expect(
      db.insert(skus).values({ storeId: otherStoreId, barcode: '7891234000011', sku: 'LOJA-CG' }),
    ).resolves.toBeDefined();
  });

  it('accepts a name when linking a SKU', async () => {
    await db.insert(skus).values({ storeId, barcode: '7891234999999', sku: 'CUECA-SLIP-M', name: 'Cueca Slip Preta M' });
    const row = await db.select().from(skus).where(eq(skus.barcode, '7891234999999'));
    expect(row[0].name).toBe('Cueca Slip Preta M');
  });

  it('defaults cashback_used to false on a new sale', async () => {
    const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '99999-0000' }).returning();
    const [sale] = await db
      .insert(sales)
      .values({ storeId, customerId: customer.id, saleDate: '2026-09-14', valueCents: 4590 })
      .returning();
    expect(sale.cashbackUsed).toBe(false);
  });

  it('logs a whatsapp send tied to a sale, and keeps the log row when the sale is deleted', async () => {
    const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '99999-0000' }).returning();
    const [sale] = await db
      .insert(sales)
      .values({ storeId, customerId: customer.id, saleDate: '2026-09-14', valueCents: 4590 })
      .returning();
    const [sent] = await db
      .insert(whatsappSends)
      .values({
        storeId,
        saleId: sale.id,
        customerName: 'Ana',
        customerPhone: '99999-0000',
        type: 'purchase',
        status: 'sent',
        trigger: 'auto',
      })
      .returning();
    expect(sent.saleId).toBe(sale.id);

    await db.delete(sales).where(eq(sales.id, sale.id));

    const [afterDelete] = await db.select().from(whatsappSends).where(eq(whatsappSends.id, sent.id));
    expect(afterDelete).toBeDefined();
    expect(afterDelete.saleId).toBeNull();
  });

  it('logs a cleanup run with the count of rows removed', async () => {
    const [log] = await db.insert(cashbackCleanupLog).values({ storeId, rowsDeleted: 3 }).returning();
    expect(log.rowsDeleted).toBe(3);
    expect(log.ranAt).toBeInstanceOf(Date);
  });
});
