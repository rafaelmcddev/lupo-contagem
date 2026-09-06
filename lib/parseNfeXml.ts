import { XMLParser } from 'fast-xml-parser';

export class InvalidNfeXmlError extends Error {}

export interface ParsedNfeItem {
  barcode: string;
  sku: string;
  name: string;
  quantity: number;
}

export interface ParsedNfeItemError {
  item: string;
  reason: string;
}

export interface ParseNfeXmlResult {
  invoiceNumber: string;
  series: string | null;
  issuedAt: string | null;
  supplierName: string | null;
  /** Items grouped by barcode — a barcode repeated across <det> lines is summed. */
  items: ParsedNfeItem[];
  errors: ParsedNfeItemError[];
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function isUsableBarcode(code: unknown): code is string {
  return typeof code === 'string' && /^\d{6,14}$/.test(code);
}

export function parseNfeXml(xml: string): ParseNfeXmlResult {
  let parsed: any;
  try {
    parsed = parser.parse(xml);
  } catch {
    throw new InvalidNfeXmlError('XML malformado.');
  }

  // Accepts both a signed NFe (nfeProc > NFe > infNFe) and a bare NFe > infNFe.
  const infNFe = parsed?.nfeProc?.NFe?.infNFe ?? parsed?.NFe?.infNFe;
  if (!infNFe) {
    throw new InvalidNfeXmlError('Não parece ser um XML de NF-e (infNFe não encontrado).');
  }

  const ide = infNFe.ide ?? {};
  const emit = infNFe.emit ?? {};
  const invoiceNumber = ide.nNF !== undefined ? String(ide.nNF) : '';
  if (!invoiceNumber) {
    throw new InvalidNfeXmlError('Número da nota (nNF) não encontrado no XML.');
  }

  const dets = asArray(infNFe.det);
  if (dets.length === 0) {
    throw new InvalidNfeXmlError('Nenhum produto (<det>) encontrado no XML.');
  }

  const totalsByBarcode = new Map<string, ParsedNfeItem>();
  const errors: ParsedNfeItemError[] = [];

  for (const det of dets) {
    const prod = det?.prod ?? {};
    const label = prod.xProd ? String(prod.xProd) : `item ${det?.['@_nItem'] ?? '?'}`;

    const rawEan = prod.cEAN !== undefined ? String(prod.cEAN) : '';
    const rawEanTrib = prod.cEANTrib !== undefined ? String(prod.cEANTrib) : '';
    const barcode = isUsableBarcode(rawEan) ? rawEan : isUsableBarcode(rawEanTrib) ? rawEanTrib : null;

    if (!barcode) {
      errors.push({ item: label, reason: 'sem código de barras (GTIN) utilizável' });
      continue;
    }

    const sku = prod.cProd !== undefined ? String(prod.cProd) : '';
    const name = prod.xProd !== undefined ? String(prod.xProd) : '';
    const quantityRaw = prod.qCom !== undefined ? Number(prod.qCom) : NaN;

    if (!sku) {
      errors.push({ item: label, reason: 'sem SKU (cProd)' });
      continue;
    }
    if (!Number.isFinite(quantityRaw) || quantityRaw <= 0) {
      errors.push({ item: label, reason: 'quantidade (qCom) inválida' });
      continue;
    }

    const quantity = Math.round(quantityRaw);
    const existing = totalsByBarcode.get(barcode);
    if (existing) {
      existing.quantity += quantity;
    } else {
      totalsByBarcode.set(barcode, { barcode, sku, name, quantity });
    }
  }

  if (totalsByBarcode.size === 0) {
    throw new InvalidNfeXmlError('Nenhum item com código de barras válido foi encontrado no XML.');
  }

  return {
    invoiceNumber,
    series: ide.serie !== undefined ? String(ide.serie) : null,
    issuedAt: ide.dhEmi !== undefined ? String(ide.dhEmi) : null,
    supplierName: emit.xNome !== undefined ? String(emit.xNome) : null,
    items: Array.from(totalsByBarcode.values()),
    errors,
  };
}
