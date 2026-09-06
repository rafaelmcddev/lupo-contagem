'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BarcodeInput } from '@/components/BarcodeInput';
import { CameraScanner, type CameraFeedback } from '@/components/CameraScanner';
import { BoxList, type BoxSummary } from '@/components/BoxList';
import { InvoiceCheckList } from '@/components/InvoiceCheckList';
import { ExportButtons } from '@/components/ExportButtons';
import { Button } from '@/components/ui/Button';
import { PageHeading } from '@/components/ui/PageHeading';
import { Pagination } from '@/components/ui/Pagination';
import { unlockSpeech, useSpeechAnnouncer } from '@/hooks/useSpeechAnnouncer';
import { enqueueScan, loadQueue, removeFromQueue } from '@/lib/scanQueue';

const BOX_PAGE_SIZE = 30;
const BOX_SEARCH_THRESHOLD = 8;

interface InvoiceCheckItem {
  barcode: string;
  sku: string | null;
  name: string | null;
  expectedQty: number;
  countedQty: number;
}

interface CountingDetail {
  counting: { id: number; name: string; status: 'active' | 'finished'; source?: 'manual' | 'xml'; invoiceNumber?: string | null };
  boxes: BoxSummary[];
  grandTotal: number;
  invoiceCheck: InvoiceCheckItem[] | null;
}

export default function CountingPage({ params }: { params: { id: string } }) {
  const countingId = params.id;
  const [detail, setDetail] = useState<CountingDetail | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingSkuBarcode, setPendingSkuBarcode] = useState<string | null>(null);
  const [skuInput, setSkuInput] = useState('');
  const [skuError, setSkuError] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cameraFeedback, setCameraFeedback] = useState<CameraFeedback | null>(null);
  const [boxQuery, setBoxQuery] = useState('');
  const [boxPage, setBoxPage] = useState(1);
  const isFlushingRef = useRef(false);
  const cameraFeedbackTokenRef = useRef(0);
  const { announceBox } = useSpeechAnnouncer();

  function notifyCamera(message: string, boxNumber?: number) {
    cameraFeedbackTokenRef.current += 1;
    setCameraFeedback({ token: cameraFeedbackTokenRef.current, message, boxNumber });
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/countings/${countingId}`);
      if (!res.ok) {
        setLoadError(res.status === 404 ? 'Contagem não encontrada.' : 'Falha ao carregar a contagem.');
        return;
      }
      const data = await res.json();
      setDetail(data);
      setLoadError(null);
    } catch {
      setLoadError('Falha ao carregar a contagem. Verifique sua conexão.');
    }
  }, [countingId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    document.addEventListener('pointerdown', unlockSpeech, { once: true });
    return () => document.removeEventListener('pointerdown', unlockSpeech);
  }, []);

  useEffect(() => {
    if (detail?.counting.status !== 'active') return;
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [detail?.counting.status, load]);

  async function submitScan(barcode: string, sku?: string, scannedAt?: number) {
    const res = await fetch(`/api/countings/${countingId}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        barcode,
        ...(sku ? { sku } : {}),
        ...(scannedAt !== undefined ? { scannedAt: new Date(scannedAt).toISOString() } : {}),
      }),
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
          const { status, data } = await submitScan(item.barcode, item.sku, item.queuedAt);
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
    if (detail?.counting.status !== 'active') return;
    flushQueue();
    const interval = setInterval(flushQueue, 5000);
    return () => clearInterval(interval);
  }, [detail?.counting.status, flushQueue]);

  useEffect(() => {
    window.addEventListener('online', flushQueue);
    return () => window.removeEventListener('online', flushQueue);
  }, [flushQueue]);

  async function handleScan(barcode: string) {
    try {
      const { status, data } = await submitScan(barcode);
      if (status === 422 && data.error === 'sku_required') {
        setSkuError(null);
        setPendingSkuBarcode(barcode);
        notifyCamera('SKU necessário');
        return;
      }
      if (status === 400) {
        setScanMessage('Código inválido — verifique a leitura.');
        notifyCamera('Código inválido');
        return;
      }
      if (status === 409) {
        setScanMessage('Esta contagem já foi finalizada.');
        notifyCamera('Contagem finalizada');
        return;
      }
      if (data.duplicate === true) {
        setScanMessage('Leitura repetida ignorada.');
        notifyCamera('Repetido, ignorado');
        return;
      }
      setScanMessage(null);
      if (data.box) {
        announceBox(data.box.boxNumber);
        notifyCamera(`Caixa ${data.box.boxNumber}`, data.box.boxNumber);
      }
      load();
    } catch {
      enqueueScan(countingId, barcode);
      setSyncing(true);
      notifyCamera('Salvo offline');
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

  if (loadError) {
    return (
      <main className="mx-auto max-w-4xl p-4 sm:p-8">
        <p className="text-2xl font-bold text-red-600">{loadError}</p>
      </main>
    );
  }
  if (!detail) return null;

  const isActive = detail.counting.status === 'active';

  const boxQueryTrimmed = boxQuery.trim().toLowerCase();
  const filteredBoxes = boxQueryTrimmed
    ? detail.boxes.filter((b) => {
        if (String(b.boxNumber).includes(boxQueryTrimmed)) return true;
        if (b.groupName?.toLowerCase().includes(boxQueryTrimmed)) return true;
        return b.skuBreakdown.some(
          (s) =>
            s.name?.toLowerCase().includes(boxQueryTrimmed) ||
            s.sku?.toLowerCase().includes(boxQueryTrimmed) ||
            s.barcode.toLowerCase().includes(boxQueryTrimmed),
        );
      })
    : detail.boxes;
  const pagedBoxes = filteredBoxes.slice((boxPage - 1) * BOX_PAGE_SIZE, boxPage * BOX_PAGE_SIZE);

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <PageHeading>{detail.counting.name}</PageHeading>
      {detail.counting.source === 'xml' && detail.counting.invoiceNumber && (
        <p className="-mt-4 mb-6 text-lg text-gray-500">Importada da NF-e nº {detail.counting.invoiceNumber}</p>
      )}

      {syncing && <p className="mb-4 text-lg text-amber-600">Sincronizando leituras pendentes...</p>}

      {scanMessage && (
        <p
          className={`mb-4 text-lg ${scanMessage === 'Leitura repetida ignorada.' ? 'text-amber-600' : 'text-red-600'}`}
        >
          {scanMessage}
        </p>
      )}

      {isActive && (
        <div className="mb-8 flex flex-col gap-4">
          <BarcodeInput onScan={handleScan} disabled={!!pendingSkuBarcode} />
          <Button
            variant="secondary"
            onClick={() => {
              unlockSpeech();
              setShowCamera(true);
            }}
          >
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
        <CameraScanner onScan={handleScan} onClose={() => setShowCamera(false)} feedback={cameraFeedback} />
      )}

      {detail.invoiceCheck && <InvoiceCheckList items={detail.invoiceCheck} />}

      {detail.boxes.length > BOX_SEARCH_THRESHOLD && (
        <input
          value={boxQuery}
          onChange={(e) => {
            setBoxQuery(e.target.value);
            setBoxPage(1);
          }}
          placeholder="Buscar caixa por número, produto, SKU ou código de barras..."
          aria-label="Buscar caixas"
          className="mb-4 w-full rounded-xl border-2 border-gray-300 px-4 py-3 text-lg placeholder:text-sm"
        />
      )}

      <BoxList boxes={pagedBoxes} />
      {filteredBoxes.length === 0 && detail.boxes.length > 0 && (
        <p className="text-lg text-gray-500">Nenhuma caixa encontrada para essa busca.</p>
      )}
      <Pagination page={boxPage} pageSize={BOX_PAGE_SIZE} total={filteredBoxes.length} onPageChange={setBoxPage} />

      <p className="my-6 text-3xl font-bold">Total: {detail.grandTotal} peças</p>

      {isActive ? (
        <Button onClick={handleFinish}>Finalizar contagem</Button>
      ) : (
        <ExportButtons counting={detail.counting} boxes={detail.boxes} />
      )}
    </main>
  );
}
