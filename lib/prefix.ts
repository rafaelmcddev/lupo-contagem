export function extractPrefix(barcode: string, prefixLength: number): string {
  return barcode.slice(0, prefixLength);
}

export function isValidBarcode(barcode: string, minLength: number): boolean {
  return /^\d+$/.test(barcode) && barcode.length >= minLength;
}
