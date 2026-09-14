export function maskPhoneDigits(rawDigits: string): string {
  const digits = rawDigits.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length === 1) return `(${digits}`;
  if (digits.length === 2) return `(${digits})`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// A phone made only of the pre-filled DDD (e.g. "(67)") is a non-empty
// string, so a plain "field not empty" check accepts it — this is the
// actual minimum length of a real local number (2-digit DDD + 8 digits),
// used to tell "the user typed nothing" apart from "field has content".
export const MIN_PHONE_DIGITS = 10;

export function hasEnoughDigits(value: string): boolean {
  return value.replace(/\D/g, '').length >= MIN_PHONE_DIGITS;
}
