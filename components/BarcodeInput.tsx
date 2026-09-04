'use client';

import { useEffect, useRef, useState } from 'react';

export function BarcodeInput({ onScan, disabled = false }: { onScan: (barcode: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const barcode = value.trim();
    if (barcode) onScan(barcode);
    setValue('');
  }

  return (
    <input
      ref={inputRef}
      value={value}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => !disabled && inputRef.current?.focus()}
      className="w-full rounded-xl border-2 border-accent px-6 py-5 text-2xl"
      placeholder="Aponte o leitor e escaneie"
      aria-label="Campo de leitura de código de barras"
    />
  );
}
