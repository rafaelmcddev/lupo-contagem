export interface SkuBreakdownEntry {
  barcode: string;
  sku: string | null;
  name: string | null;
  total: number;
}

export interface BoxSummary {
  boxNumber: number;
  groupName: string | null;
  total: number;
  skuBreakdown: SkuBreakdownEntry[];
}

export interface CountingInfo {
  name: string;
}

export function toCsv(counting: CountingInfo, boxes: BoxSummary[]): string {
  const header = 'Caixa,Grupo,Nome,SKU,Código de barras,Quantidade';
  const rows = boxes.flatMap((b) =>
    b.skuBreakdown.map(
      (s) =>
        `${b.boxNumber},"${b.groupName ?? ''}","${s.name ?? 'Sem nome'}","${s.sku ?? ''}","${s.barcode}",${s.total}`,
    ),
  );
  const total = boxes.reduce((sum, b) => sum + b.total, 0);
  return [`Contagem: ${counting.name}`, header, ...rows, `Total,,,,,${total}`].join('\n');
}

export function toWhatsAppText(counting: CountingInfo, boxes: BoxSummary[]): string {
  const lines = boxes.flatMap((b) => {
    const groupSuffix = b.groupName ? ` (${b.groupName})` : '';
    // A box with a single product doesn't need its total repeated on its own
    // line and then again on the product line right below — fold them into
    // one line. Multi-product boxes still get the box total plus a
    // breakdown line per product.
    if (b.skuBreakdown.length === 1) {
      const s = b.skuBreakdown[0];
      return [`Caixa ${b.boxNumber}${groupSuffix}: ${s.name ?? 'Sem nome'} (${s.sku ?? s.barcode}) — ${b.total}`];
    }
    return [
      `Caixa ${b.boxNumber}${groupSuffix}: ${b.total}`,
      ...b.skuBreakdown.map((s) => `  - ${s.name ?? 'Sem nome'} (${s.sku ?? s.barcode}): ${s.total}`),
    ];
  });
  const total = boxes.reduce((sum, b) => sum + b.total, 0);
  return [`*${counting.name}*`, ...lines, `Total: ${total}`].join('\n');
}
