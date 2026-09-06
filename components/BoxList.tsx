export interface SkuBreakdownEntry {
  sku: string | null;
  total: number;
}

export interface BoxSummary {
  boxNumber: number;
  groupName: string | null;
  total: number;
  skuBreakdown: SkuBreakdownEntry[];
}

export function BoxList({ boxes }: { boxes: BoxSummary[] }) {
  if (boxes.length === 0) {
    return <p className="text-lg text-gray-500">Nenhuma caixa ainda. Comece a escanear.</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {boxes.map((box) => (
        <li key={box.boxNumber} className="rounded-2xl border border-gray-200 bg-paper p-5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-3xl font-bold text-ink">Caixa {box.boxNumber}</p>
            <p className="text-xl font-semibold text-accent">{box.total} peças</p>
          </div>
          {box.groupName && <p className="text-base text-gray-600">{box.groupName}</p>}
          <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3">
            {box.skuBreakdown.map((s) => (
              <li key={s.sku ?? 'sem-sku'} className="flex justify-between gap-2 text-sm text-gray-600">
                <span className="truncate font-mono">{s.sku ?? 'Sem SKU'}</span>
                <span className="shrink-0">{s.total}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
