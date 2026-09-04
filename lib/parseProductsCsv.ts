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
  const allLines = csv.split(/\r?\n/);

  // Find the first non-blank line as the header
  let headerIdx = -1;
  for (let i = 0; i < allLines.length; i++) {
    if (allLines[i].trim().length > 0) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) throw new InvalidCsvHeaderError();

  const header = allLines[headerIdx].split(';').map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf('nome');
  const skuIdx = header.indexOf('sku');
  const barcodeIdx = header.indexOf('codebar');
  if (nameIdx === -1 || skuIdx === -1 || barcodeIdx === -1) throw new InvalidCsvHeaderError();

  const rows: ParsedProductRow[] = [];
  const errors: ProductRowError[] = [];

  for (let i = headerIdx + 1; i < allLines.length; i++) {
    const lineContent = allLines[i];

    // Skip blank lines without reporting an error
    if (lineContent.trim().length === 0) {
      continue;
    }

    const cols = lineContent.split(';');
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
