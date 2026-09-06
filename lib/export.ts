export interface SkuBreakdownEntry {
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
  const header = 'Caixa,Grupo,Nome,SKU,Quantidade';
  const rows = boxes.flatMap((b) =>
    b.skuBreakdown.map(
      (s) => `${b.boxNumber},"${b.groupName ?? ''}","${s.name ?? 'Sem nome'}","${s.sku ?? 'Sem SKU'}",${s.total}`,
    ),
  );
  const total = boxes.reduce((sum, b) => sum + b.total, 0);
  return [`Contagem: ${counting.name}`, header, ...rows, `Total,,,,${total}`].join('\n');
}

export function toWhatsAppText(counting: CountingInfo, boxes: BoxSummary[]): string {
  const lines = boxes.flatMap((b) => [
    `Caixa ${b.boxNumber}${b.groupName ? ` (${b.groupName})` : ''}: ${b.total}`,
    ...b.skuBreakdown.map((s) => `  - ${s.name ?? 'Sem nome'} (${s.sku ?? 'Sem SKU'}): ${s.total}`),
  ]);
  const total = boxes.reduce((sum, b) => sum + b.total, 0);
  return [`*${counting.name}*`, ...lines, `Total: ${total}`].join('\n');
}
