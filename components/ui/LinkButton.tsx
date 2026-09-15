import { ReactNode } from 'react';
import Link, { LinkProps } from 'next/link';
import { BUTTON_BASE_CLASSES, ButtonSize, ButtonVariant, iconSizeClasses, sizeClasses, variantClasses } from './buttonStyles';

// A <Link> styled exactly like <Button> — for navigation, not actions. Shares
// buttonStyles.ts with Button.tsx so the two never drift apart visually.
export function LinkButton({
  variant = 'secondary',
  size = 'lg',
  icon,
  className = '',
  children,
  ...props
}: LinkProps & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Link className={`${BUTTON_BASE_CLASSES} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`} {...props}>
      {icon && <span className={iconSizeClasses[size]}>{icon}</span>}
      {children}
    </Link>
  );
}
