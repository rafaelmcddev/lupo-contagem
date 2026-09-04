import { describe, expect, it } from 'vitest';
import { toCsv, toWhatsAppText } from './export';

const counting = { name: 'Entrega Lupo 03/09' };
const boxes = [
  {
    boxNumber: 1,
    groupName: 'Cueca Slip Preta',
    total: 10,
    skuBreakdown: [
      { sku: 'CUECA-SLIP-P', total: 6 },
      { sku: 'CUECA-SLIP-M', total: 4 },
    ],
  },
  {
    boxNumber: 2,
    groupName: null,
    total: 7,
    skuBreakdown: [
      { sku: 'OUTRO-SKU', total: 5 },
      { sku: null, total: 2 },
    ],
  },
];

describe('toCsv', () => {
  it('includes a header row, one row per SKU within each box, and a total row', () => {
    const csv = toCsv(counting, boxes);
    expect(csv).toContain('Caixa,Grupo,SKU,Quantidade');
    expect(csv).toContain('1,"Cueca Slip Preta","CUECA-SLIP-P",6');
    expect(csv).toContain('1,"Cueca Slip Preta","CUECA-SLIP-M",4');
    expect(csv).toContain('2,"","OUTRO-SKU",5');
    expect(csv).toContain('2,"","Sem SKU",2');
    expect(csv).toContain('Total,,,17');
  });
});

describe('toWhatsAppText', () => {
  it('lists each box with its group, total, and an indented line per SKU', () => {
    const text = toWhatsAppText(counting, boxes);
    expect(text).toContain('Caixa 1 (Cueca Slip Preta): 10');
    expect(text).toContain('  - CUECA-SLIP-P: 6');
    expect(text).toContain('  - CUECA-SLIP-M: 4');
    expect(text).toContain('Caixa 2: 7');
    expect(text).toContain('  - OUTRO-SKU: 5');
    expect(text).toContain('  - Sem SKU: 2');
    expect(text).toContain('Total: 17');
  });
});
