// Formats a "YYYY-MM-DD" date string (as stored/returned by the sales API)
// as "DD/MM/YYYY" for display. Deliberately string-based instead of going
// through `Date` — parsing "YYYY-MM-DD" with `new Date(...)` reads it as UTC
// midnight, which can shift the displayed day depending on the browser's
// local timezone.
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatDateBR(isoDate: string): string {
  const match = isoDate.match(ISO_DATE_PATTERN);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}
