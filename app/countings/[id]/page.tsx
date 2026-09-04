'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BarcodeInput } from '@/components/BarcodeInput';
import { CameraScanner } from '@/components/CameraScanner';
import { BoxList, type BoxSummary } from '@/components/BoxList';
import { ExportButtons } from '@/components/ExportButtons';
import { Button } from '@/components/ui/Button';
import { PageHeading } from '@/components/ui/PageHeading';
import { useSpeechAnnouncer } from '@/hooks/useSpeechAnnouncer';
import { enqueueScan, loadQueue, removeFromQueue } from '@/lib/scanQueue';

interface CountingDetail {
  counting: { id: number; name: string; status: 'active' | 'finished' };
  boxes: BoxSummary[];
  grandTotal: number;
}

export default function CountingPage({ params }: { params: { id: string } }) {
  const countingId = params.id;
  const [detail, setDetail] = useState<CountingDetail | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingSkuBarcode, setPendingSkuBarcode] = useState<string | null>(null);
  const [skuInput, setSkuInput] = useState('');
  const [skuError, setSkuError] = useState<string | null>(null);
  const isFlushingRef = useRef(false);
  const { announceBox } = useSpeechAnnouncer();

  const load = useCallback(async () => {
    const res = await fetch(`/api/countings/${countingId}`);
    const data = await res.json();
    setDetail(data);
  }, [countingId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (detail?.counting.status !== 'active') return;
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [detail?.counting.status, load]);

  async function submitScan(barcode: string, sku?: string) {
    const res = await fetch(`/api/countings/${countingId}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sku ? { barcode, sku } : { barcode }),
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  const flushQueue = useCallback(async () => {
    if (isFlushingRef.current) return;
    isFlushingRef.current = true;
    try {
      const queued = loadQueue().filter((q) => q.countingId === countingId);
      if (queued.length === 0) return;
      setSyncing(true);
      for (const item of queued) {
        try {
          const { status, data } = await submitScan(item.barcode, item.sku);
          if (status === 200) {
            removeFromQueue(loadQueue(), item);
          } else if (status === 422 && data.error === 'sku_required') {
            removeFromQueue(loadQueue(), item);
            setPendingSkuBarcode(item.barcode);
            break;
          } else {
            // Any other status (e.g. a transient 5xx): leave it queued and
            // retry on the next tick rather than silently discarding it.
            break;
          }
        } catch {
          break;
        }
      }
      setSyncing(loadQueue().filter((q) => q.countingId === countingId).length > 0);
      load();
    } finally {
      isFlushingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countingId, load]);

  useEffect(() => {
    flushQueue();
    window.addEventListener('online', flushQueue);
    const interval = setInterval(flushQueue, 5000);
    return () => {
      window.removeEventListener('online', flushQueue);
      clearInterval(interval);
    };
  }, [flushQueue]);

  async function handleScan(barcode: string) {
    try {
      const { status, data } = await submitScan(barcode);
      if (status === 422 && data.error === 'sku_required') {
        setSkuError(null);
        setPendingSkuBarcode(barcode);
        return;
      }
      if (!data.duplicate && data.box) {
        announceBox(data.box.boxNumber);
      }
      load();
    } catch {
      enqueueScan(countingId, barcode);
      setSyncing(true);
    }
  }

  async function handleSkuSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingSkuBarcode || !skuInput.trim()) return;
    const barcode = pendingSkuBarcode;
    const sku = skuInput.trim();
    try {
      const { status, data } = await submitScan(barcode, sku);
      if (status !== 200) {
        setSkuError('Não foi possível vincular esse SKU. Tente novamente.');
        return;
      }
      setPendingSkuBarcode(null);
      setSkuInput('');
      setSkuError(null);
      if (!data.duplicate && data.box) {
        announceBox(data.box.boxNumber);
      }
      load();
    } catch {
      enqueueScan(countingId, barcode, sku);
      setSyncing(true);
      setPendingSkuBarcode(null);
      setSkuInput('');
      setSkuError(null);
    }
  }

  async function handleFinish() {
    if (detail && detail.grandTotal === 0) {
      const confirmed = window.confirm('Finalizar uma contagem sem nenhuma leitura?');
      if (!confirmed) return;
    }
    await fetch(`/api/countings/${countingId}/finish`, { method: 'POST' });
    load();
  }

  if (!detail) return null;

  const isActive = detail.counting.status === 'active';

  return (
    <main className="mx-auto max-w-4xl p-8">
      <PageHeading>{detail.counting.name}</PageHeading>

      {syncing && <p className="mb-4 text-lg text-amber-600">Sincronizando leituras pendentes...</p>}

      {isActive && (
        <div className="mb-8 flex flex-col gap-4">
          <BarcodeInput onScan={handleScan} disabled={!!pendingSkuBarcode} />
          <Button variant="secondary" onClick={() => setShowCamera(true)}>
            Usar câmera
          </Button>
        </div>
      )}

      {pendingSkuBarcode && (
        <form onSubmit={handleSkuSubmit} className="mb-8 flex flex-col gap-4 rounded-2xl border-2 border-accent p-6">
          <label className="text-xl font-medium" htmlFor="skuInput">
            Código {pendingSkuBarcode} ainda não tem SKU vinculado. Qual é o SKU dessa peça?
          </label>
          <input
            id="skuInput"
            autoFocus
            value={skuInput}
            onChange={(e) => setSkuInput(e.target.value)}
            className="rounded-xl border-2 border-gray-300 px-4 py-4 text-xl"
          />
          {skuError && <p className="text-lg text-red-600">{skuError}</p>}
          <Button type="submit">Vincular SKU e contar</Button>
        </form>
      )}

      {isActive && showCamera && (
        <CameraScanner
          onScan={(code) => {
            handleScan(code);
            setShowCamera(false);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}

      <BoxList boxes={detail.boxes} />

      <p className="my-6 text-3xl font-bold">Total: {detail.grandTotal} peças</p>

      {isActive ? (
        <Button onClick={handleFinish}>Finalizar contagem</Button>
      ) : (
        <ExportButtons counting={detail.counting} boxes={detail.boxes} />
      )}
    </main>
  );
}
