import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerPicker } from './CustomerPicker';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CustomerPicker', () => {
  it('does not search until a query is typed', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<CustomerPicker onSelect={() => {}} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows matching customers after typing, debounced', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ customers: [{ id: 1, name: 'Ana', phone: '99999-0000' }], total: 1 }) }),
    );
    render(<CustomerPicker onSelect={() => {}} />);
    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Ana' } });
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
  });

  it('calls onSelect when a result is clicked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ customers: [{ id: 1, name: 'Ana', phone: '99999-0000' }], total: 1 }) }),
    );
    const onSelect = vi.fn();
    render(<CustomerPicker onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Ana' } });
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Ana'));
    expect(onSelect).toHaveBeenCalledWith({ id: 1, name: 'Ana', phone: '99999-0000' });
  });

  it('shows a create-customer form pre-filled with the query when the search finds nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ customers: [], total: 0 }) }));
    render(<CustomerPicker onSelect={() => {}} />);
    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Bia' } });
    await waitFor(() => expect(screen.getByText('Cliente não encontrado.')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Cadastrar novo cliente'));
    expect(screen.getByPlaceholderText('Nome do cliente')).toHaveValue('Bia');
  });

  it('creates a customer, masking the phone as it is typed, and calls onSelect with the created customer', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ customers: [], total: 0 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ customer: { id: 2, name: 'Bia', phone: '(67) 98888-0000' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const onSelect = vi.fn();
    render(<CustomerPicker onSelect={onSelect} />);

    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Bia' } });
    await waitFor(() => expect(screen.getByText('Cliente não encontrado.')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Cadastrar novo cliente'));
    fireEvent.change(screen.getByPlaceholderText('Telefone'), { target: { value: '67988880000' } });
    expect(screen.getByPlaceholderText('Telefone')).toHaveValue('(67) 98888-0000');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar e selecionar' }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith({ id: 2, name: 'Bia', phone: '(67) 98888-0000' }));
  });
});
