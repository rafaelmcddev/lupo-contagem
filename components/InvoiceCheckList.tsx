import { Card } from '@/components/ui/Card';

export interface InvoiceCheckItem {
  barcode: string;
  sku: string | null;
  name: string | null;
  expectedQty: number;
  countedQty: number;
}

function statusFor(item: InvoiceCheckItem): { label: string; classes: string } {
  if (item.countedQty === item.expectedQty) {
    return { label: 'OK', classes: 'bg-emerald-100 text-emerald-700' };
  }
  if (item.countedQty < item.expectedQty) {
    return { label: `Faltam ${item.expectedQty - item.countedQty}`, classes: 'bg-amber-100 text-amber-700' };
  }
  return { label: `${item.countedQty - item.expectedQty} a mais`, classes: 'bg-red-100 text-red-700' };
}

export function InvoiceCheckList({ items }: { items: InvoiceCheckItem[] }) {
  if (items.length === 0) return null;

  const expectedTotal = items.reduce((sum, i) => sum + i.expectedQty, 0);
  const countedTotal = items.reduce((sum, i) => sum + i.countedQty, 0);
  const pendingCount = items.filter((i) => i.countedQty !== i.expectedQty).length;

  return (
    <Card className="mb-8">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-semibold">Conferência da nota</h2>
        <p className={`text-lg font-medium ${pendingCount === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
          {pendingCount === 0 ? 'Tudo bateu ✓' : `${pendingCount} item(ns) divergente(s)`}
        </p>
      </div>

      <div className="grid gap-2">
        {items.map((item) => {
          const status = statusFor(item);
          return (
            <div
              key={item.barcode}
              className="flex flex-col gap-2 rounded-xl border border-gray-100 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{item.name ?? item.barcode}</p>
                <p className="text-sm text-gray-500">
                  {item.sku ?? '—'} · <span className="font-mono">{item.barcode}</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">
                  {item.countedQty} / {item.expectedQty}
                </span>
                <span className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold ${status.classes}`}>
                  {status.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-right text-sm text-gray-500">
        Total contado: {countedTotal} / {expectedTotal} da nota
      </p>
    </Card>
  );
}
