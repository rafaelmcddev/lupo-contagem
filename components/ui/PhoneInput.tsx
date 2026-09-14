'use client';

import { useEffect, useState } from 'react';
import { maskPhoneDigits } from '@/lib/masks';

// Local DDD (área de Coxim-MS/Campo Grande-MS): pré-preenche o campo pra
// agilizar a digitação quando não há telefone existente — o usuário
// continua livre pra apagar e trocar por outro DDD.
const DEFAULT_DDD = '67';

export function PhoneInput({
  initialValue = DEFAULT_DDD,
  onChangeValue,
  placeholder,
  ariaLabel,
  className,
}: {
  initialValue?: string;
  onChangeValue: (formatted: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [digits, setDigits] = useState(initialValue.replace(/\D/g, '').slice(0, 11));

  // The field can show a non-empty value (the pre-filled DDD, or a seeded
  // initialValue) before the user ever types — tell the parent about that
  // starting value once on mount, so its own state doesn't silently
  // disagree with what's on screen (e.g. submitting before ever touching
  // the field).
  // Deliberately runs once on mount only, to sync the parent with
  // whatever this field starts showing (the pre-filled DDD, or a seeded
  // initialValue) — not meant to re-run on later `digits` changes.
  useEffect(() => {
    onChangeValue(maskPhoneDigits(digits));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawValue = e.target.value;
    let nextDigits = rawValue.replace(/\D/g, '').slice(0, 11);
    // Backspacing over mask punctuation only (e.g. the ")" in "(67)") leaves
    // the underlying digits unchanged — re-deriving them from rawValue
    // yields the exact same string, so the mask would redraw the same
    // punctuation right back and backspace would look like it does nothing.
    // Treat that case as a request to drop the last digit instead.
    if (nextDigits === digits && rawValue.length < maskPhoneDigits(digits).length) {
      nextDigits = nextDigits.slice(0, -1);
    }
    setDigits(nextDigits);
    onChangeValue(maskPhoneDigits(nextDigits));
  }

  return (
    <input
      type="tel"
      inputMode="numeric"
      value={maskPhoneDigits(digits)}
      onChange={handleChange}
      placeholder={placeholder ?? '(00) 00000-0000'}
      aria-label={ariaLabel}
      className={className}
    />
  );
}
