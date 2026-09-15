import { ButtonHTMLAttributes, ReactNode } from 'react';
import { BUTTON_BASE_CLASSES, ButtonSize, ButtonVariant, iconOnlySizeClasses, iconSizeClasses, sizeClasses, variantClasses } from './buttonStyles';

export function Button({
  variant = 'primary',
  size = 'lg',
  icon,
  iconOnly = false,
  className = '',
  children,
  'aria-label': ariaLabel,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; iconOnly?: boolean }) {
  return (
    <button
      className={`${BUTTON_BASE_CLASSES} ${iconOnly ? iconOnlySizeClasses[size] : sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      aria-label={ariaLabel}
      title={iconOnly && typeof children === 'string' ? children : undefined}
      {...props}
    >
      {icon && <span className={iconSizeClasses[size]}>{icon}</span>}
      {!iconOnly && children}
    </button>
  );
}
