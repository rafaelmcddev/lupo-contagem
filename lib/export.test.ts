import { describe, expect, it } from 'vitest';
import { toCsv, toWhatsAppText } from './export';

const counting = { name: 'Entrega Lupo 03/09' };
const boxes = [
  {
    boxNumber: 1,
    groupName: 'Cueca Slip Preta',
    total: 10,
    skuBreakdown: [
      { barcode: '7891234000011', sku: 'CUECA-SLIP-P', name: 'Cueca Slip Preta P', total: 6 },
      { barcode: '7891234000028', sku: 'CUECA-SLIP-M', name: 'Cueca Slip Preta M', total: 4 },
    ],
  },
  {
    boxNumber: 2,
    groupName: null,
    total: 5,
    skuBreakdown: [{ barcode: '7899999000011', sku: 'OUTRO-SKU', name: null, total: 5 }],
  },
  {
    boxNumber: 3,
    groupName: null,
    total: 2,
    skuBreakdown: [{ barcode: '7899999999999', sku: null, name: null, total: 2 }],
  },
];

describe('toCsv', () => {
  it('includes a header row, one row per product within each box, and a single grand-total row', () => {
    const csv = toCsv(counting, boxes);
    expect(csv).toContain('Caixa,Grupo,Nome,SKU,Código de barras,Quantidade');
    expect(csv).toContain('1,"Cueca Slip Preta","Cueca Slip Preta P","CUECA-SLIP-P","7891234000011",6');
    expect(csv).toContain('1,"Cueca Slip Preta","Cueca Slip Preta M","CUECA-SLIP-M","7891234000028",4');
    expect(csv).toContain('2,"","Sem nome","OUTRO-SKU","7899999000011",5');
    expect(csv).toContain('3,"","Sem nome","","7899999999999",2');
    // One overall total across every box — never a repeated per-box total.
    expect(csv).toContain('Total,,,,,17');
  });
});

describe('toWhatsAppText', () => {
  it('collapses a single-product box into one line instead of repeating the quantity', () => {
    const text = toWhatsAppText(counting, boxes);
    expect(text).toContain('Caixa 2: Sem nome (OUTRO-SKU) — 5');
    expect(text).toContain('Caixa 3: Sem nome (7899999999999) — 2');
    // The per-box total is never printed on its own line for a single-product box.
    expect(text).not.toContain('Caixa 2: 5\n');
    expect(text).not.toContain('Caixa 3: 2\n');
  });

  it('still shows the box total plus an indented line per product for a multi-product box', () => {
    const text = toWhatsAppText(counting, boxes);
    expect(text).toContain('Caixa 1 (Cueca Slip Preta): 10');
    expect(text).toContain('  - Cueca Slip Preta P (CUECA-SLIP-P): 6');
    expect(text).toContain('  - Cueca Slip Preta M (CUECA-SLIP-M): 4');
  });

  it('prints a single grand total at the end, summed across all boxes', () => {
    const text = toWhatsAppText(counting, boxes);
    expect(text).toContain('Total: 17');
    expect(text.match(/Total:/g)).toHaveLength(1);
  });
});
