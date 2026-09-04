import { describe, expect, it } from 'vitest';
import { InvalidCsvHeaderError, parseProductsCsv } from './parseProductsCsv';

describe('parseProductsCsv', () => {
  it('parses valid rows with the header in the documented order', () => {
    const csv = 'nome;sku;codebar\nCueca Slip Preta P;CUECA-SLIP-P;7891234000011\nCueca Slip Preta M;CUECA-SLIP-M;7891234000028';
    const { rows, errors } = parseProductsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { name: 'Cueca Slip Preta P', sku: 'CUECA-SLIP-P', barcode: '7891234000011' },
      { name: 'Cueca Slip Preta M', sku: 'CUECA-SLIP-M', barcode: '7891234000028' },
    ]);
  });

  it('recognizes header columns by name regardless of order', () => {
    const csv = 'codebar;nome;sku\n7891234000011;Cueca Slip Preta P;CUECA-SLIP-P';
    const { rows } = parseProductsCsv(csv);
    expect(rows).toEqual([{ name: 'Cueca Slip Preta P', sku: 'CUECA-SLIP-P', barcode: '7891234000011' }]);
  });

  it('matches header names case-insensitively', () => {
    const csv = 'NOME;SKU;CODEBAR\nX;Y;123';
    const { rows } = parseProductsCsv(csv);
    expect(rows).toEqual([{ name: 'X', sku: 'Y', barcode: '123' }]);
  });

  it('throws InvalidCsvHeaderError when a required column is missing', () => {
    expect(() => parseProductsCsv('nome;sku\nX;Y')).toThrow(InvalidCsvHeaderError);
  });

  it('throws InvalidCsvHeaderError for an empty file', () => {
    expect(() => parseProductsCsv('')).toThrow(InvalidCsvHeaderError);
  });

  it('collects a row error for a non-numeric barcode, without stopping the rest', () => {
    const csv = 'nome;sku;codebar\nX;Y;abc\nZ;W;123';
    const { rows, errors } = parseProductsCsv(csv);
    expect(rows).toEqual([{ name: 'Z', sku: 'W', barcode: '123' }]);
    expect(errors).toEqual([{ line: 2, reason: 'código de barras vazio ou não numérico' }]);
  });

  it('collects a row error for a blank sku or name', () => {
    const csv = 'nome;sku;codebar\n;Y;123\nZ;;456';
    const { rows, errors } = parseProductsCsv(csv);
    expect(rows).toEqual([]);
    expect(errors).toEqual([
      { line: 2, reason: 'nome em branco' },
      { line: 3, reason: 'SKU em branco' },
    ]);
  });

  it('skips blank lines', () => {
    const csv = 'nome;sku;codebar\n\nX;Y;123\n\n';
    const { rows } = parseProductsCsv(csv);
    expect(rows).toEqual([{ name: 'X', sku: 'Y', barcode: '123' }]);
  });

  it('reports correct line numbers when blank lines precede error rows', () => {
    const csv = 'nome;sku;codebar\n\nX;Y;abc\nZ;W;123';
    const { rows, errors } = parseProductsCsv(csv);
    expect(rows).toEqual([{ name: 'Z', sku: 'W', barcode: '123' }]);
    expect(errors).toEqual([{ line: 3, reason: 'código de barras vazio ou não numérico' }]);
  });

  it('handles blank lines before the header', () => {
    const csv = '\nnome;sku;codebar\nX;Y;123';
    const { rows, errors } = parseProductsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ name: 'X', sku: 'Y', barcode: '123' }]);
  });
});
