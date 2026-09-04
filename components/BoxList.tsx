export interface SkuBreakdownEntry {
  sku: string;
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
    return <p className="text-xl text-gray-500">Nenhuma caixa ainda. Comece a escanear.</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {boxes.map((box) => (
        <li key={box.boxNumber} className="rounded-2xl border border-gray-200 bg-paper p-6 shadow-sm">
          <p className="text-4xl font-bold text-ink">Caixa {box.boxNumber}</p>
          {box.groupName && <p className="text-lg text-gray-600">{box.groupName}</p>}
          <p className="text-2xl font-semibold text-accent">{box.total} peças</p>
          <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3">
            {box.skuBreakdown.map((s) => (
              <li key={s.sku} className="flex justify-between text-base text-gray-600">
                <span>{s.sku}</span>
                <span>{s.total}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
