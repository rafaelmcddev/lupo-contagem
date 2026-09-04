const DEFAULT_WINDOW_MS = 1000;

export function isDuplicateScan(
  lastScanAt: Date | null,
  lastBarcode: string | null,
  barcode: string,
  now: Date,
  windowMs: number = DEFAULT_WINDOW_MS,
): boolean {
  if (!lastScanAt || lastBarcode !== barcode) return false;
  const delta = now.getTime() - lastScanAt.getTime();
  return delta >= 0 && delta < windowMs;
}
