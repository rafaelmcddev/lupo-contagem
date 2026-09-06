import { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-dark active:bg-accent-dark',
  secondary: 'bg-canvas text-ink border border-gray-200 hover:bg-gray-100 active:bg-gray-200',
  danger: 'bg-danger text-white hover:bg-red-800 active:bg-red-900',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`rounded-xl px-6 py-3.5 text-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
