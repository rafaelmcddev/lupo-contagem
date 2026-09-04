export interface QueuedScan {
  countingId: string;
  barcode: string;
  sku?: string;
  queuedAt: number;
}

const STORAGE_KEY = 'lupo-contagem:scan-queue';

export function loadQueue(): QueuedScan[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedScan[]) : [];
  } catch {
    return [];
  }
}

export function saveQueue(queue: QueuedScan[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function enqueueScan(countingId: string, barcode: string, sku?: string): QueuedScan[] {
  const queue = loadQueue();
  const updated = [...queue, { countingId, barcode, sku, queuedAt: Date.now() }];
  saveQueue(updated);
  return updated;
}

export function removeFromQueue(queue: QueuedScan[], toRemove: QueuedScan): QueuedScan[] {
  const updated = queue.filter((q) => q.queuedAt !== toRemove.queuedAt);
  saveQueue(updated);
  return updated;
}
