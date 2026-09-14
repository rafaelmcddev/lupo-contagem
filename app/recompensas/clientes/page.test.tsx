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
  it('shows the PIN form when not unlocked, without ever calling fetch', async () => {
    document.cookie = 'store_id=1; path=/';
    // The customer-list content (and its load() effect) now only mounts
    // once PinGate actually unlocks — a regression guard for the bug where
    // load() fired on every mount regardless of lock state.
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ClientesPage />);
    await waitFor(() => expect(screen.getByPlaceholderText('PIN')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads the customer list immediately after successfully entering the PIN, with no reload needed', async () => {
    document.cookie = 'store_id=1; path=/';
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/sale-pin/verify') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
      }
      return Promise.resolve({ json: async () => ({ customers: [{ id: 1, name: 'Ana', phone: '(67) 99999-0000' }], total: 1 }) });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ClientesPage />);
    await waitFor(() => expect(screen.getByPlaceholderText('PIN')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
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

  it('rejects a phone number that is just the pre-filled DDD', async () => {
    unlock();
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ customers: [], total: 0 }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClientesPage />);
    await waitFor(() => expect(screen.getByText('Nenhum cliente cadastrado.')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Nome do cliente'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(await screen.findByText('Preencha nome e telefone.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u, i]: [string, RequestInit?]) => u === '/api/customers' && i?.method === 'POST')).toBe(false);
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

  it('shows an error and keeps the row when removing a customer fails', async () => {
    unlock();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ customers: [{ id: 1, name: 'Ana', phone: '(67) 99999-0000' }], total: 1 }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'server_error' }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClientesPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(screen.getByText('Não foi possível remover esse cliente.')).toBeInTheDocument());
    expect(screen.getByText('Ana')).toBeInTheDocument();
  });
});
