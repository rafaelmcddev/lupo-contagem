import { describe, expect, it } from 'vitest';
import { InvalidNfeXmlError, parseNfeXml } from './parseNfeXml';

function detXml({
  nItem,
  cProd,
  cEAN,
  xProd,
  qCom,
  cEANTrib,
}: {
  nItem: number;
  cProd: string;
  cEAN: string;
  xProd: string;
  qCom: string;
  cEANTrib?: string;
}) {
  return `
    <det nItem="${nItem}">
      <prod>
        <cProd>${cProd}</cProd>
        <cEAN>${cEAN}</cEAN>
        <xProd>${xProd}</xProd>
        <qCom>${qCom}</qCom>
        <cEANTrib>${cEANTrib ?? cEAN}</cEANTrib>
      </prod>
    </det>`;
}

function sampleNfe(detsXml: string) {
  return `<?xml version="1.0"?>
  <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <infNFe Id="NFe123" versao="4.00">
        <ide>
          <nNF>1001</nNF>
          <serie>1</serie>
          <dhEmi>2026-01-10T10:00:00-03:00</dhEmi>
        </ide>
        <emit>
          <xNome>Fornecedor Teste Ltda</xNome>
        </emit>
        ${detsXml}
      </infNFe>
    </NFe>
  </nfeProc>`;
}

describe('parseNfeXml', () => {
  it('extracts invoice metadata and items', () => {
    const xml = sampleNfe(
      detXml({ nItem: 1, cProd: 'SKU-001', cEAN: '7891234000011', xProd: 'Produto A', qCom: '3.0000' }),
    );
    const result = parseNfeXml(xml);

    expect(result.invoiceNumber).toBe('1001');
    expect(result.series).toBe('1');
    expect(result.supplierName).toBe('Fornecedor Teste Ltda');
    expect(result.items).toEqual([{ barcode: '7891234000011', sku: 'SKU-001', name: 'Produto A', quantity: 3 }]);
    expect(result.errors).toEqual([]);
  });

  it('sums quantities for items that repeat the same barcode across multiple <det> lines', () => {
    const xml = sampleNfe(
      detXml({ nItem: 1, cProd: 'SKU-001', cEAN: '7891234000011', xProd: 'Produto A', qCom: '3.0000' }) +
        detXml({ nItem: 2, cProd: 'SKU-001', cEAN: '7891234000011', xProd: 'Produto A', qCom: '2.0000' }),
    );
    const result = parseNfeXml(xml);
    expect(result.items).toEqual([{ barcode: '7891234000011', sku: 'SKU-001', name: 'Produto A', quantity: 5 }]);
  });

  it('handles a single <det> (not wrapped in an array) the same as multiple', () => {
    const xml = sampleNfe(
      detXml({ nItem: 1, cProd: 'SKU-001', cEAN: '7891234000011', xProd: 'Produto A', qCom: '3.0000' }),
    );
    const result = parseNfeXml(xml);
    expect(result.items).toHaveLength(1);
  });

  it('falls back to cEANTrib when cEAN is "SEM GTIN"', () => {
    const xml = sampleNfe(
      detXml({
        nItem: 1,
        cProd: 'SKU-001',
        cEAN: 'SEM GTIN',
        cEANTrib: '7891234000011',
        xProd: 'Produto A',
        qCom: '3.0000',
      }),
    );
    const result = parseNfeXml(xml);
    expect(result.items).toEqual([{ barcode: '7891234000011', sku: 'SKU-001', name: 'Produto A', quantity: 3 }]);
  });

  it('reports an error for an item with no usable barcode while keeping the valid ones', () => {
    const xml = sampleNfe(
      detXml({ nItem: 1, cProd: 'SKU-001', cEAN: '7891234000011', xProd: 'Produto A', qCom: '3.0000' }) +
        detXml({
          nItem: 2,
          cProd: 'SKU-002',
          cEAN: 'SEM GTIN',
          cEANTrib: 'SEM GTIN',
          xProd: 'Produto Sem Codigo',
          qCom: '1.0000',
        }),
    );
    const result = parseNfeXml(xml);
    expect(result.items).toEqual([{ barcode: '7891234000011', sku: 'SKU-001', name: 'Produto A', quantity: 3 }]);
    expect(result.errors).toEqual([{ item: 'Produto Sem Codigo', reason: 'sem código de barras (GTIN) utilizável' }]);
  });

  it('throws InvalidNfeXmlError when no item in the invoice has a usable barcode', () => {
    const xml = sampleNfe(
      detXml({
        nItem: 1,
        cProd: 'SKU-001',
        cEAN: 'SEM GTIN',
        cEANTrib: 'SEM GTIN',
        xProd: 'Produto A',
        qCom: '3.0000',
      }),
    );
    expect(() => parseNfeXml(xml)).toThrow(InvalidNfeXmlError);
  });

  it('throws InvalidNfeXmlError for XML that is not an NF-e', () => {
    expect(() => parseNfeXml('<root><foo>bar</foo></root>')).toThrow(InvalidNfeXmlError);
  });

  it('throws InvalidNfeXmlError for malformed XML', () => {
    expect(() => parseNfeXml('not xml at all <<>')).toThrow(InvalidNfeXmlError);
  });

  it('throws InvalidNfeXmlError when there are no <det> items', () => {
    const xml = sampleNfe('');
    expect(() => parseNfeXml(xml)).toThrow(InvalidNfeXmlError);
  });

  it('accepts a bare NFe root without the nfeProc wrapper', () => {
    const xml = `<?xml version="1.0"?>
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <infNFe Id="NFe123" versao="4.00">
        <ide><nNF>2002</nNF></ide>
        <emit><xNome>Fornecedor B</xNome></emit>
        ${detXml({ nItem: 1, cProd: 'SKU-002', cEAN: '7891234000028', xProd: 'Produto B', qCom: '1.0000' })}
      </infNFe>
    </NFe>`;
    const result = parseNfeXml(xml);
    expect(result.invoiceNumber).toBe('2002');
    expect(result.items).toHaveLength(1);
  });
});
