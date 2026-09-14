// Small inline icon set for buttons — no icon library dependency. Each icon
// is decorative only (paired with a visible text label on the button), so
// they're aria-hidden and never carry their own accessible name.
type IconProps = { className?: string };

const commonProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function PencilIcon({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function XIcon({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function SendIcon({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <path d="m3 3 18 9-18 9 4-9-4-9Z" />
    </svg>
  );
}
