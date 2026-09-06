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

function ProductLabel({ entry }: { entry: SkuBreakdownEntry }) {
  return (
    <>
      <span className="text-gray-800">{entry.name ?? 'Sem nome'}</span>
      <span className="ml-1 font-mono text-gray-500">({entry.sku ?? entry.barcode})</span>
    </>
  );
}

export function BoxList({ boxes }: { boxes: BoxSummary[] }) {
  if (boxes.length === 0) {
    return <p className="text-lg text-gray-500">Nenhuma caixa ainda. Comece a escanear.</p>;
  }
  return (
    <ul className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-paper">
      {boxes.map((box) => {
        // Today a box almost always holds a single product — collapse to one
        // line (box, product, quantity) instead of showing the same number
        // three times (box total, product total, and — on the finished
        // screen — the grand total). Only spell out a per-product breakdown
        // when a box genuinely holds more than one product.
        const onlyEntry = box.skuBreakdown.length === 1 ? box.skuBreakdown[0] : null;
        return (
          <li key={box.boxNumber} className="p-4">
            {onlyEntry ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-semibold text-ink">Caixa {box.boxNumber}</span>
                  {box.groupName && <span className="ml-2 text-sm text-gray-500">{box.groupName}</span>}
                  <p className="truncate text-sm">
                    <ProductLabel entry={onlyEntry} />
                  </p>
                </div>
                <span className="shrink-0 text-xl font-bold text-accent">{box.total}</span>
              </div>
            ) : (
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink">Caixa {box.boxNumber}</span>
                  <span className="text-xl font-bold text-accent">{box.total}</span>
                </div>
                {box.groupName && <p className="text-sm text-gray-500">{box.groupName}</p>}
                <ul className="mt-1.5 space-y-1">
                  {box.skuBreakdown.map((s) => (
                    <li key={s.barcode} className="flex items-start justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        <ProductLabel entry={s} />
                      </span>
                      <span className="shrink-0 text-gray-600">{s.total}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
