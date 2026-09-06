import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { countings, invoiceItems, skus } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { POST } from './route';

beforeEach(resetDb);

function sampleXml(nNF = '1001') {
  return `<?xml version="1.0"?>
  <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <infNFe Id="NFe123" versao="4.00">
        <ide><nNF>${nNF}</nNF><serie>1</serie></ide>
        <emit><xNome>Fornecedor Teste</xNome></emit>
        <det nItem="1">
          <prod>
            <cProd>SKU-001</cProd>
            <cEAN>7891234000011</cEAN>
            <xProd>Produto A</xProd>
            <qCom>3.0000</qCom>
          </prod>
        </det>
        <det nItem="2">
          <prod>
            <cProd>SKU-002</cProd>
            <cEAN>7891234000028</cEAN>
            <xProd>Produto B</xProd>
            <qCom>6.0000</qCom>
          </prod>
        </det>
      </infNFe>
    </NFe>
  </nfeProc>`;
}

describe('/api/countings/import-xml', () => {
  it('creates an xml-sourced counting with invoice items and updates the products catalog', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ xml: sampleXml() }) }));
    expect(res.status).toBe(201);
    const data = await res.json();

    expect(data.counting).toMatchObject({ source: 'xml', invoiceNumber: '1001', supplierName: 'Fornecedor Teste' });
    expect(data.itemsImported).toBe(2);
    expect(data.productsCreated).toBe(2);
    expect(data.productsUpdated).toBe(0);
    expect(data.itemErrors).toEqual([]);

    const items = await db.select().from(invoiceItems);
    expect(items).toHaveLength(2);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ barcode: '7891234000011', sku: 'SKU-001', expectedQty: 3 }),
        expect.objectContaining({ barcode: '7891234000028', sku: 'SKU-002', expectedQty: 6 }),
      ]),
    );

    const products = await db.select().from(skus);
    expect(products).toHaveLength(2);
  });

  it('uses a default name derived from the invoice number and supplier when none is given', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ xml: sampleXml('2002') }) }));
    const data = await res.json();
    expect(data.counting.name).toBe('NF 2002 — Fornecedor Teste');
  });

  it('uses a custom name when provided', async () => {
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ xml: sampleXml(), name: 'Entrega de segunda' }),
      }),
    );
    const data = await res.json();
    expect(data.counting.name).toBe('Entrega de segunda');
  });

  it('updates an existing product instead of duplicating it', async () => {
    await db.insert(skus).values({ barcode: '7891234000011', sku: 'ANTIGO', name: 'Nome antigo' });
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ xml: sampleXml() }) }));
    const data = await res.json();
    expect(data.productsCreated).toBe(1);
    expect(data.productsUpdated).toBe(1);
  });

  it('returns 400 invalid_xml for XML that is not an NF-e', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ xml: '<a/>' }) }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_xml');
  });

  it('returns 400 for an empty body', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ xml: '' }) }));
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });

  it('does not create a counting at all when the request is invalid', async () => {
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ xml: '<a/>' }) }));
    const rows = await db.select().from(countings);
    expect(rows).toHaveLength(0);
  });
});
