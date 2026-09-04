import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BarcodeInput } from './BarcodeInput';

describe('BarcodeInput', () => {
  afterEach(() => cleanup());
  it('calls onScan with the typed value when Enter is pressed, and clears the field', () => {
    const onScan = vi.fn();
    render(<BarcodeInput onScan={onScan} />);
    const input = screen.getByLabelText('Campo de leitura de código de barras') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '7891234000011' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onScan).toHaveBeenCalledWith('7891234000011');
    expect(input.value).toBe('');
  });

  it('does not call onScan for other keys', () => {
    const onScan = vi.fn();
    render(<BarcodeInput onScan={onScan} />);
    const input = screen.getByLabelText('Campo de leitura de código de barras');
    fireEvent.change(input, { target: { value: '123' } });
    fireEvent.keyDown(input, { key: 'a' });
    expect(onScan).not.toHaveBeenCalled();
  });

  it('ignores Enter on an empty field', () => {
    const onScan = vi.fn();
    render(<BarcodeInput onScan={onScan} />);
    const input = screen.getByLabelText('Campo de leitura de código de barras');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onScan).not.toHaveBeenCalled();
  });
});
