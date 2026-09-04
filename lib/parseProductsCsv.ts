export class InvalidCsvHeaderError extends Error {}

export interface ParsedProductRow {
  barcode: string;
  sku: string;
  name: string;
}

export interface ProductRowError {
  line: number;
  reason: string;
}

export interface ParseProductsCsvResult {
  rows: ParsedProductRow[];
  errors: ProductRowError[];
}

export function parseProductsCsv(csv: string): ParseProductsCsvResult {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) throw new InvalidCsvHeaderError();

  const header = lines[0].split(';').map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf('nome');
  const skuIdx = header.indexOf('sku');
  const barcodeIdx = header.indexOf('codebar');
  if (nameIdx === -1 || skuIdx === -1 || barcodeIdx === -1) throw new InvalidCsvHeaderError();

  const rows: ParsedProductRow[] = [];
  const errors: ProductRowError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    const barcode = (cols[barcodeIdx] ?? '').trim();
    const sku = (cols[skuIdx] ?? '').trim();
    const name = (cols[nameIdx] ?? '').trim();
    const line = i + 1;

    if (!name) {
      errors.push({ line, reason: 'nome em branco' });
      continue;
    }
    if (!sku) {
      errors.push({ line, reason: 'SKU em branco' });
      continue;
    }
    if (!/^\d+$/.test(barcode)) {
      errors.push({ line, reason: 'código de barras vazio ou não numérico' });
      continue;
    }
    rows.push({ barcode, sku, name });
  }

  return { rows, errors };
}
