import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClientesPage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'store_id=; path=/; max-age=0';
  document.cookie = 'sale_pin_ok=; path=/; max-age=0';
});

function unlock() {
  document.cookie = 'store_id=1; path=/';
  document.cookie = 'sale_pin_ok=1; path=/';
}

describe('ClientesPage', () => {
  it('shows the PIN form when not unlocked', async () => {
    document.cookie = 'store_id=1; path=/';
    // The page's load() effect fires on mount regardless of PinGate's lock
    // state (it just never gets a customer list to show while locked) — an
    // unstubbed fetch here would hit the real network with a relative URL,
    // which Node's fetch rejects with "Invalid URL" outside a browser.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ customers: [], total: 0 }) }));
    render(<ClientesPage />);
    await waitFor(() => expect(screen.getByPlaceholderText('PIN')).toBeInTheDocument());
  });

  it('lists customers when unlocked', async () => {
    unlock();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ customers: [{ id: 1, name: 'Ana', phone: '(67) 99999-0000' }], total: 1 }),
      }),
    );
    render(<ClientesPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
  });

  it('creates a customer, masking the phone as it is typed', async () => {
    unlock();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ customers: [], total: 0 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ customer: { id: 1, name: 'Ana', phone: '(67) 99999-0000' } }) })
      .mockResolvedValueOnce({ json: async () => ({ customers: [{ id: 1, name: 'Ana', phone: '(67) 99999-0000' }], total: 1 }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClientesPage />);
    await waitFor(() => expect(screen.getByText('Nenhum cliente cadastrado.')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Nome do cliente'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByPlaceholderText('Telefone'), { target: { value: '67999990000' } });
    expect(screen.getByPlaceholderText('Telefone')).toHaveValue('(67) 99999-0000');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    const postCall = fetchMock.mock.calls.find(([u, i]: [string, RequestInit?]) => u === '/api/customers' && i?.method === 'POST');
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toEqual({ name: 'Ana', phone: '(67) 99999-0000' });
  });

  it('removes a customer after confirming', async () => {
    unlock();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ customers: [{ id: 1, name: 'Ana', phone: '(67) 99999-0000' }], total: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ json: async () => ({ customers: [], total: 0 }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClientesPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/customers/1', { method: 'DELETE' }));
  });
});
