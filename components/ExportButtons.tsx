'use client';

import { toCsv, toWhatsAppText, type BoxSummary, type CountingInfo } from '@/lib/export';
import { Button } from '@/components/ui/Button';

export function ExportButtons({ counting, boxes }: { counting: CountingInfo; boxes: BoxSummary[] }) {
  function downloadCsv() {
    const csv = toCsv(counting, boxes);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${counting.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyWhatsAppText() {
    await navigator.clipboard.writeText(toWhatsAppText(counting, boxes));
  }

  return (
    <div className="flex flex-wrap gap-4">
      <Button variant="secondary" onClick={downloadCsv}>
        Exportar CSV
      </Button>
      <Button variant="secondary" onClick={copyWhatsAppText}>
        Copiar texto WhatsApp
      </Button>
    </div>
  );
}
