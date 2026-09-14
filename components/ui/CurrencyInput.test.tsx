import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CurrencyInput } from './CurrencyInput';

describe('CurrencyInput', () => {
  it('starts empty when no initial value is given', () => {
    render(<CurrencyInput onChangeCents={() => {}} ariaLabel="Valor" />);
    expect(screen.getByLabelText('Valor')).toHaveValue('');
  });

  it('formats typed digits as BRL currency and reports the equivalent cents', () => {
    const onChangeCents = vi.fn();
    render(<CurrencyInput onChangeCents={onChangeCents} ariaLabel="Valor" />);
    const input = screen.getByLabelText('Valor');

    fireEvent.change(input, { target: { value: '4' } });
    expect(input).toHaveValue('R$ 0,04');
    expect(onChangeCents).toHaveBeenLastCalledWith(4);

    fireEvent.change(input, { target: { value: '459' } });
    expect(input).toHaveValue('R$ 4,59');
    expect(onChangeCents).toHaveBeenLastCalledWith(459);

    fireEvent.change(input, { target: { value: '4590' } });
    expect(input).toHaveValue('R$ 45,90');
    expect(onChangeCents).toHaveBeenLastCalledWith(4590);
  });

  it('ignores non-digit characters typed into the field', () => {
    const onChangeCents = vi.fn();
    render(<CurrencyInput onChangeCents={onChangeCents} ariaLabel="Valor" />);
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: 'R$ 45,90' } });
    expect(screen.getByLabelText('Valor')).toHaveValue('R$ 45,90');
    expect(onChangeCents).toHaveBeenLastCalledWith(4590);
  });

  it('seeds the display from initialCents', () => {
    render(<CurrencyInput initialCents={4590} onChangeCents={() => {}} ariaLabel="Valor" />);
    expect(screen.getByLabelText('Valor')).toHaveValue('R$ 45,90');
  });
});
