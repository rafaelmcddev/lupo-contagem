// Shared between Button.tsx and LinkButton.tsx so a real <button> and a
// styled <Link> always look identical — never hand-copy these class strings.
export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export type ButtonSize = 'lg' | 'sm';

export const BUTTON_BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

export const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white shadow-sm hover:bg-accent-dark active:bg-accent-dark',
  secondary: 'bg-canvas text-ink border border-gray-200 hover:bg-gray-100 active:bg-gray-200',
  danger: 'bg-danger text-white hover:bg-red-800 active:bg-red-900',
};

// "lg" is the original touch-friendly size used by the barcode-counting
// screens (built for tapping on a tablet in the warehouse) — left as the
// default so those screens are unaffected. "sm" is for data-entry/office
// screens, where giant text was overflowing narrow inputs and dwarfing
// table rows.
export const sizeClasses: Record<ButtonSize, string> = {
  lg: 'rounded-xl px-6 py-3.5 text-xl',
  sm: 'rounded-lg px-4 py-2 text-base',
};

// Square, compact padding for icon-only buttons — used in dense table rows
// (multiple actions per row) where a full icon+label button doesn't fit
// without forcing horizontal scroll. Same rounding as the labeled "sm" size.
export const iconOnlySizeClasses: Record<ButtonSize, string> = {
  lg: 'rounded-xl p-3.5',
  sm: 'rounded-lg p-2',
};

export const iconSizeClasses: Record<ButtonSize, string> = {
  lg: 'h-5 w-5',
  sm: 'h-4 w-4',
};
