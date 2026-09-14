import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PhoneInput } from './PhoneInput';

describe('PhoneInput', () => {
  it('pre-fills the local DDD (67) when no initial value is given, to speed up typing', () => {
    render(<PhoneInput onChangeValue={() => {}} ariaLabel="Telefone" />);
    expect(screen.getByLabelText('Telefone')).toHaveValue('(67');
  });

  it('allows replacing the pre-filled DDD entirely', () => {
    const onChangeValue = vi.fn();
    render(<PhoneInput onChangeValue={onChangeValue} ariaLabel="Telefone" />);
    fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '11988887777' } });
    expect(screen.getByLabelText('Telefone')).toHaveValue('(11) 98888-7777');
    expect(onChangeValue).toHaveBeenLastCalledWith('(11) 98888-7777');
  });

  it('formats typed digits with the (00) 00000-0000 mask and reports the formatted value', () => {
    const onChangeValue = vi.fn();
    render(<PhoneInput onChangeValue={onChangeValue} ariaLabel="Telefone" />);
    const input = screen.getByLabelText('Telefone');

    fireEvent.change(input, { target: { value: '67999123456' } });
    expect(input).toHaveValue('(67) 99912-3456');
    expect(onChangeValue).toHaveBeenLastCalledWith('(67) 99912-3456');
  });

  it('seeds the display from initialValue', () => {
    render(<PhoneInput initialValue="67999123456" onChangeValue={() => {}} ariaLabel="Telefone" />);
    expect(screen.getByLabelText('Telefone')).toHaveValue('(67) 99912-3456');
  });
});
