import { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';
type Size = 'lg' | 'sm';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent text-white shadow-sm hover:bg-accent-dark active:bg-accent-dark',
  secondary: 'bg-canvas text-ink border border-gray-200 hover:bg-gray-100 active:bg-gray-200',
  danger: 'bg-danger text-white hover:bg-red-800 active:bg-red-900',
};

// "lg" is the original touch-friendly size used by the barcode-counting
// screens (built for tapping on a tablet in the warehouse) — left as the
// default so those screens are unaffected. "sm" is for data-entry/office
// screens (Recompensas, Clientes, Produtos, Grupos, Configurações), where
// giant text was overflowing narrow inputs and dwarfing table rows.
const sizeClasses: Record<Size, string> = {
  lg: 'rounded-xl px-6 py-3.5 text-xl',
  sm: 'rounded-lg px-4 py-2 text-base',
};

// Square, compact padding for icon-only buttons — used in dense table rows
// (multiple actions per row) where a full icon+label button doesn't fit
// without forcing horizontal scroll. Same rounding as the labeled "sm" size.
const iconOnlySizeClasses: Record<Size, string> = {
  lg: 'rounded-xl p-3.5',
  sm: 'rounded-lg p-2',
};

const iconSizeClasses: Record<Size, string> = {
  lg: 'h-5 w-5',
  sm: 'h-4 w-4',
};

export function Button({
  variant = 'primary',
  size = 'lg',
  icon,
  iconOnly = false,
  className = '',
  children,
  'aria-label': ariaLabel,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: ReactNode; iconOnly?: boolean }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${iconOnly ? iconOnlySizeClasses[size] : sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      aria-label={ariaLabel}
      title={iconOnly && typeof children === 'string' ? children : undefined}
      {...props}
    >
      {icon && <span className={iconSizeClasses[size]}>{icon}</span>}
      {!iconOnly && children}
    </button>
  );
}
