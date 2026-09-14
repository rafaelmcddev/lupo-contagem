'use client';

import { useState } from 'react';
import { formatCentsAsBRL } from '@/lib/currency';

export function CurrencyInput({
  initialCents = 0,
  onChangeCents,
  ariaLabel,
  className,
}: {
  initialCents?: number;
  onChangeCents: (cents: number) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const [digits, setDigits] = useState(initialCents > 0 ? String(initialCents) : '');

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextDigits = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    setDigits(nextDigits);
    onChangeCents(nextDigits === '' ? 0 : Number(nextDigits));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={digits === '' ? '' : formatCentsAsBRL(Number(digits))}
      onChange={handleChange}
      placeholder="R$ 0,00"
      aria-label={ariaLabel}
      className={className}
    />
  );
}
